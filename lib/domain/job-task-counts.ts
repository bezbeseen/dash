import { TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type JobTaskCounts = { open: number; done: number };

/** Per-job ticket task totals from `Task` (job-linked only). */
export async function taskCountsByJobId(jobIds: string[]): Promise<Map<string, JobTaskCounts>> {
  const map = new Map<string, JobTaskCounts>();
  if (jobIds.length === 0) return map;

  const rows = await prisma.task.groupBy({
    by: ['jobId', 'status'],
    where: { jobId: { in: jobIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (!row.jobId) continue;
    const cur = map.get(row.jobId) ?? { open: 0, done: 0 };
    if (row.status === TaskStatus.OPEN) cur.open = row._count._all;
    else if (row.status === TaskStatus.DONE) cur.done = row._count._all;
    map.set(row.jobId, cur);
  }

  return map;
}
