import { ArchiveReason, BoardStatus, EventSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { qbEventDateLabelFromMetadata } from '@/lib/domain/activity-metadata';
import { DASHBOARD_COLUMNS, type DashboardColumnKey } from '@/lib/domain/board-display';
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

/** Activity log rows for the Activity page (and any other caller). */
export async function loadRecentActions(limit: number): Promise<DashboardRecentAction[]> {
  if (limit <= 0) return [];
  const recentLogRows = await prisma.activityLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
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

export type DashboardSummary = {
  onBoardCount: number;
  leadCount: number;
  columnCounts: Record<DashboardColumnKey, number>;
  money: ReturnType<typeof computeMoneyRollup>;
  doneCount: number;
  quickBooksConnected: boolean;
  gmailMailboxCount: number;
  lastActivityAt: Date | null;
};

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const [boardGroups, leadCount, moneyRows, doneCount, qbCount, gmailCount, lastJob] = await Promise.all([
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
    prisma.quickBooksToken.count(),
    prisma.gmailConnection.count(),
    prisma.job.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);

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
    quickBooksConnected: qbCount > 0,
    gmailMailboxCount: gmailCount,
    lastActivityAt: lastJob?.updatedAt ?? null,
  };
}
