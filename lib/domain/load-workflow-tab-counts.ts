import { ArchiveReason, BoardStatus, TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { WorkflowTabCounts } from '@/lib/domain/workflow-tabs';

const ticketTaskBaseWhere = {
  jobId: { not: null },
  job: { is: { archivedAt: null } },
};

export async function loadWorkflowTabCounts(): Promise<WorkflowTabCounts> {
  const [prequote, tickets, openTasks, openTodos, done] = await Promise.all([
    prisma.job.count({
      where: { archivedAt: null, boardStatus: BoardStatus.REQUESTED },
    }),
    prisma.job.count({
      where: { archivedAt: null, boardStatus: { not: BoardStatus.REQUESTED } },
    }),
    prisma.task.count({
      where: { ...ticketTaskBaseWhere, status: TaskStatus.OPEN },
    }),
    prisma.todo.count({
      where: { status: 'OPEN' },
    }),
    prisma.job.count({
      where: { archiveReason: ArchiveReason.DONE },
    }),
  ]);

  return { prequote, tickets, openTasks, openTodos, done };
}
