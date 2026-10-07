import { TaskStatus, type Prisma } from '@prisma/client';
import { fmtDueDate, pastDueCutoff } from '@/lib/ticket/format';

/** Board jobs query: each card's open tasks (only what the card shows) and its done-task count. */
export const jobCardTasksInclude = {
  tasks: {
    where: { status: TaskStatus.OPEN },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, title: true, assigneeEmail: true, dueAt: true },
  },
  _count: { select: { tasks: { where: { status: TaskStatus.DONE } } } },
} satisfies Prisma.JobInclude;

export type JobWithCardTasks = Prisma.JobGetPayload<{ include: typeof jobCardTasksInclude }>;

/** Open task as the card's client panel gets it: dates already formatted in shop terms. */
export type JobCardTask = {
  id: string;
  title: string;
  assigneeEmail: string | null;
  dueLabel: string | null;
  overdue: boolean;
};

export function jobCardTasks(tasks: JobWithCardTasks['tasks'], now = new Date()): JobCardTask[] {
  const dueCutoff = pastDueCutoff(now);
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    assigneeEmail: t.assigneeEmail,
    dueLabel: t.dueAt ? fmtDueDate(t.dueAt) : null,
    overdue: t.dueAt != null && t.dueAt < dueCutoff,
  }));
}
