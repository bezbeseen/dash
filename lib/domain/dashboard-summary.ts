import { ArchiveReason, BoardStatus, EventSource, TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { qbEventDateLabelFromMetadata } from '@/lib/domain/activity-metadata';
import { DASHBOARD_COLUMNS, type DashboardColumnKey } from '@/lib/domain/board-display';
import { loadQbTicketsToolbar } from '@/lib/domain/load-qb-tickets-toolbar';
import { computeMoneyRollup } from '@/lib/domain/money-rollup';

export type DashboardRecentAction = {
  id: string;
  createdAt: Date;
  /** QuickBooks transaction date when present on sync metadata (estimate/invoice txnDate). */
  qbEventAtLabel: string | null;
  source: EventSource;
  eventName: string;
  message: string;
  jobId: string;
  ticketTitle: string;
};

export type LoadRecentActionsFilter = {
  /** Only rows whose `eventName` starts with this string (e.g. `review_request_email`). */
  eventNamePrefix?: string;
};

/** Activity log rows for the Activity page (and any other caller). */
export async function loadRecentActions(
  limit: number,
  filter?: LoadRecentActionsFilter,
): Promise<DashboardRecentAction[]> {
  if (limit <= 0) return [];
  const prefix = filter?.eventNamePrefix?.trim();
  const recentLogRows = await prisma.activityLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    where: prefix ? { eventName: { startsWith: prefix } } : undefined,
    select: {
      id: true,
      createdAt: true,
      metadata: true,
      source: true,
      eventName: true,
      message: true,
      jobId: true,
      job: { select: { customerName: true, projectName: true } },
    },
  });
  return recentLogRows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    qbEventAtLabel: qbEventDateLabelFromMetadata(row.metadata),
    source: row.source,
    eventName: row.eventName,
    message: row.message,
    jobId: row.jobId,
    ticketTitle: `${row.job.customerName} \u00b7 ${row.job.projectName}`,
  }));
}

function columnCountsFromBoardStatuses(
  tallies: Partial<Record<BoardStatus, number>>,
): Record<DashboardColumnKey, number> {
  const out = {} as Record<DashboardColumnKey, number>;
  for (const col of DASHBOARD_COLUMNS) {
    if (col === 'READY_INVOICED') {
      out[col] = (tallies.READY ?? 0) + (tallies.INVOICED ?? 0);
    } else {
      out[col] = tallies[col as BoardStatus] ?? 0;
    }
  }
  return out;
}

export type DashboardCustomerRollup = {
  customerName: string;
  jobCount: number;
  invoicedCents: number;
  paidCents: number;
};

export type DashboardTicketTaskStats = {
  open: number;
  done: number;
  overdue: number;
};

/** Activity log `eventName` prefix for post–mark-Done review request emails (`lib/email/review-request-after-done.ts`). */
export const REVIEW_REQUEST_EMAIL_ACTIVITY_PREFIX = 'review_request_email';

export type DashboardReviewRequestEmailStats = {
  /** Rolling lookback for numeric tallies (server clock). */
  windowDays: number;
  sentAuto: number;
  sentManual: number;
  skipped: number;
  failed: number;
  /** Most recent review-email log row of any kind (all time). */
  lastEventAt: Date | null;
};

async function loadReviewRequestEmailDashboardStats(since: Date): Promise<DashboardReviewRequestEmailStats> {
  const [groups, last] = await Promise.all([
    prisma.activityLog.groupBy({
      by: ['eventName'],
      where: {
        createdAt: { gte: since },
        eventName: { startsWith: REVIEW_REQUEST_EMAIL_ACTIVITY_PREFIX },
      },
      _count: { id: true },
    }),
    prisma.activityLog.findFirst({
      where: { eventName: { startsWith: REVIEW_REQUEST_EMAIL_ACTIVITY_PREFIX } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.eventName] = g._count.id;
  return {
    windowDays: 30,
    sentAuto: counts['review_request_email.sent'] ?? 0,
    sentManual: counts['review_request_email.sent_manual'] ?? 0,
    skipped: counts['review_request_email.skipped'] ?? 0,
    failed: counts['review_request_email.failed'] ?? 0,
    lastEventAt: last?.createdAt ?? null,
  };
}

export type DashboardSummary = {
  onBoardCount: number;
  leadCount: number;
  columnCounts: Record<DashboardColumnKey, number>;
  money: ReturnType<typeof computeMoneyRollup>;
  doneCount: number;
  quickBooksConnected: boolean;
  quickBooksLastTicketSyncAt: Date | null;
  quickBooksLastSyncUnknown: boolean;
  driveFoldersLinkedCount: number;
  gmailMailboxCount: number;
  lastActivityAt: Date | null;
  ticketTasks: DashboardTicketTaskStats;
  topCustomers: DashboardCustomerRollup[];
  reviewRequestEmail: DashboardReviewRequestEmailStats;
};

const ticketTaskBaseWhere = {
  jobId: { not: null },
  job: { is: { archivedAt: null } },
};

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const reviewEmailSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [
    boardGroups,
    leadCount,
    moneyRows,
    doneCount,
    driveFoldersLinkedCount,
    qbToolbar,
    gmailCount,
    lastJob,
    customerGroups,
    ticketTasksOpen,
    ticketTasksDone,
    ticketTasksOverdue,
    reviewRequestEmail,
  ] = await Promise.all([
    prisma.job.groupBy({
      by: ['boardStatus'],
      where: {
        archivedAt: null,
        boardStatus: { not: BoardStatus.REQUESTED },
      },
      _count: { id: true },
    }),
    prisma.job.count({
      where: { archivedAt: null, boardStatus: BoardStatus.REQUESTED },
    }),
    prisma.job.findMany({
      where: { archivedAt: null },
      select: {
        estimateAmountCents: true,
        invoiceAmountCents: true,
        amountPaidCents: true,
      },
    }),
    prisma.job.count({ where: { archiveReason: ArchiveReason.DONE } }),
    prisma.job.count({
      where: { archivedAt: null, googleDriveFolderId: { not: null } },
    }),
    loadQbTicketsToolbar(),
    prisma.gmailConnection.count(),
    prisma.job.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
    prisma.job.groupBy({
      by: ['customerName'],
      where: { archivedAt: null },
      _count: { id: true },
      _sum: { invoiceAmountCents: true, amountPaidCents: true },
    }),
    prisma.task.count({
      where: { ...ticketTaskBaseWhere, status: TaskStatus.OPEN },
    }),
    prisma.task.count({
      where: { ...ticketTaskBaseWhere, status: TaskStatus.DONE },
    }),
    prisma.task.count({
      where: {
        ...ticketTaskBaseWhere,
        status: TaskStatus.OPEN,
        dueAt: { lt: now },
      },
    }),
    loadReviewRequestEmailDashboardStats(reviewEmailSince),
  ]);

  const topCustomers: DashboardCustomerRollup[] = customerGroups
    .map((g) => ({
      customerName: g.customerName,
      jobCount: g._count.id,
      invoicedCents: g._sum.invoiceAmountCents ?? 0,
      paidCents: g._sum.amountPaidCents ?? 0,
    }))
    .sort((a, b) => b.invoicedCents - a.invoicedCents)
    .slice(0, 5);

  const tallies: Partial<Record<BoardStatus, number>> = {};
  let onBoardCount = 0;
  for (const g of boardGroups) {
    tallies[g.boardStatus] = g._count.id;
    onBoardCount += g._count.id;
  }

  return {
    onBoardCount,
    leadCount,
    columnCounts: columnCountsFromBoardStatuses(tallies),
    money: computeMoneyRollup(moneyRows),
    doneCount,
    quickBooksConnected: qbToolbar.hasToken,
    quickBooksLastTicketSyncAt: qbToolbar.lastTicketSyncAt,
    quickBooksLastSyncUnknown: qbToolbar.lastSyncUnknown,
    driveFoldersLinkedCount,
    gmailMailboxCount: gmailCount,
    lastActivityAt: lastJob?.updatedAt ?? null,
    ticketTasks: {
      open: ticketTasksOpen,
      done: ticketTasksDone,
      overdue: ticketTasksOverdue,
    },
    topCustomers,
    reviewRequestEmail,
  };
}
