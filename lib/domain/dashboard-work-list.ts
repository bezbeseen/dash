import { BoardStatus, TaskStatus, type InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';

export const DASHBOARD_WORK_LIST_LIMIT = 50;

export type DashboardWorkRow = {
  id: string;
  title: string;
  subtitle: string | null;
  statusLabel: string;
  dateAt: Date;
  dateLabel: string;
  updatedAt: Date;
  openTasks: number;
  overdueTasks: number;
  nextDueAt: Date | null;
  invoiceStatus: InvoiceStatus;
  invoiceAmountCents: number;
  amountPaidCents: number;
  prodWrapUpNotes: string | null;
  prodWrapUpAt: Date | null;
};

export type DashboardWorkList = {
  rows: DashboardWorkRow[];
  totalOnBoard: number;
};

export function workDateForJob(job: {
  boardStatus: BoardStatus;
  paidAt: Date | null;
  deliveredAt: Date | null;
  readyAt: Date | null;
  startedAt: Date | null;
  qbOrderingAt: Date | null;
  createdAt: Date;
}): { at: Date; label: string } {
  switch (job.boardStatus) {
    case BoardStatus.PAID:
      if (job.paidAt) return { at: job.paidAt, label: 'Paid' };
      break;
    case BoardStatus.DELIVERED:
      if (job.deliveredAt) return { at: job.deliveredAt, label: 'Delivered' };
      break;
    case BoardStatus.READY:
    case BoardStatus.INVOICED:
      if (job.readyAt) return { at: job.readyAt, label: 'Ready' };
      break;
    case BoardStatus.PRODUCTION:
      if (job.startedAt) return { at: job.startedAt, label: 'Started' };
      break;
    default:
      break;
  }
  if (job.qbOrderingAt) return { at: job.qbOrderingAt, label: 'QB date' };
  return { at: job.createdAt, label: 'Created' };
}

/** Active production jobs for the home work list (not pre-quote, not archived). */
export async function loadDashboardWorkList(now = new Date()): Promise<DashboardWorkList> {
  const where = { archivedAt: null, boardStatus: { not: BoardStatus.REQUESTED } } as const;

  const [jobs, totalOnBoard] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [
        { qbOrderingAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      take: DASHBOARD_WORK_LIST_LIMIT,
      select: {
        id: true,
        customerName: true,
        projectName: true,
        projectDescription: true,
        boardStatus: true,
        paidAt: true,
        deliveredAt: true,
        readyAt: true,
        startedAt: true,
        qbOrderingAt: true,
        createdAt: true,
        updatedAt: true,
        invoiceStatus: true,
        invoiceAmountCents: true,
        amountPaidCents: true,
        prodWrapUpNotes: true,
        prodWrapUpAt: true,
        tasks: {
          where: { status: TaskStatus.OPEN },
          select: { dueAt: true },
        },
      },
    }),
    prisma.job.count({ where }),
  ]);

  const rows: DashboardWorkRow[] = jobs.map((job) => {
    const { at, label } = workDateForJob(job);
    const dueDates = job.tasks.map((t) => t.dueAt).filter((d): d is Date => d != null);
    dueDates.sort((a, b) => a.getTime() - b.getTime());
    return {
      id: job.id,
      title: jobPrimaryHeading(job),
      subtitle: jobSecondaryHeading(job),
      statusLabel: boardStatusDisplayLabel(job.boardStatus),
      dateAt: at,
      dateLabel: label,
      updatedAt: job.updatedAt,
      openTasks: job.tasks.length,
      overdueTasks: dueDates.filter((d) => d < now).length,
      nextDueAt: dueDates[0] ?? null,
      invoiceStatus: job.invoiceStatus,
      invoiceAmountCents: job.invoiceAmountCents,
      amountPaidCents: job.amountPaidCents,
      prodWrapUpNotes: job.prodWrapUpNotes,
      prodWrapUpAt: job.prodWrapUpAt,
    };
  });

  return { rows, totalOnBoard };
}
