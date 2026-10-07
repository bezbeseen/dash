import { TaskStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { jobPrimaryHeading } from '@/lib/domain/job-display';
import { ticketCustomerLine, type TicketTaskTableRow } from '@/lib/domain/ticket-task-table';
import { fmtDueDate, fmtShortDate, pastDueCutoff } from '@/lib/ticket/format';

export const DASHBOARD_TICKET_TASKS_LIMIT = 200;

export type DashboardTicketTasksModule = {
  rows: TicketTaskTableRow[];
  openTotal: number;
  openMine: number;
  openOverdue: number;
};

/** Same scope as the Ticket tasks tab count: open tasks on tickets still on the board. */
const openTicketTaskWhere: Prisma.TaskWhereInput = {
  status: TaskStatus.OPEN,
  jobId: { not: null },
  job: { is: { archivedAt: null } },
};

export async function loadDashboardTicketTasks(
  viewerEmailLower: string | null,
  now = new Date(),
): Promise<DashboardTicketTasksModule> {
  const dueCutoff = pastDueCutoff(now);
  const [tasks, openTotal, openMine, openOverdue] = await Promise.all([
    prisma.task.findMany({
      where: openTicketTaskWhere,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: DASHBOARD_TICKET_TASKS_LIMIT,
      select: {
        id: true,
        title: true,
        notes: true,
        dueAt: true,
        assigneeEmail: true,
        createdByEmail: true,
        createdAt: true,
        job: { select: { id: true, customerName: true, projectName: true } },
      },
    }),
    prisma.task.count({ where: openTicketTaskWhere }),
    viewerEmailLower
      ? prisma.task.count({ where: { ...openTicketTaskWhere, assigneeEmail: viewerEmailLower } })
      : Promise.resolve(0),
    prisma.task.count({ where: { ...openTicketTaskWhere, dueAt: { lt: dueCutoff } } }),
  ]);

  const rows: TicketTaskTableRow[] = [];
  for (const task of tasks) {
    if (!task.job) continue;
    const ticketTitle = jobPrimaryHeading(task.job);
    rows.push({
      id: task.id,
      title: task.title,
      notes: task.notes,
      jobId: task.job.id,
      ticketTitle,
      ticketCustomer: ticketCustomerLine(ticketTitle, task.job.customerName),
      assigneeEmail: task.assigneeEmail,
      dueAt: task.dueAt?.toISOString() ?? null,
      dueLabel: task.dueAt ? fmtDueDate(task.dueAt) : null,
      overdue: task.dueAt != null && task.dueAt < dueCutoff,
      createdAt: task.createdAt.toISOString(),
      createdLabel: fmtShortDate(task.createdAt),
      createdByEmail: task.createdByEmail,
    });
  }

  return { rows, openTotal, openMine, openOverdue };
}
