import type { Job } from '@prisma/client';

export type DoneMonthGroup = {
  key: string;
  label: string;
  jobs: Job[];
};

function archiveDate(job: Job): Date {
  return job.archivedAt ?? job.updatedAt;
}

function monthKeyAndLabel(d: Date): { key: string; label: string } {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const key = `${y}-${String(m).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  );
  return { key, label };
}

/** Groups DONE jobs by calendar month of `archivedAt` (fallback `updatedAt`). Input order preserved within each month. */
export function groupDoneJobsByMonth(jobsSortedNewestFirst: Job[]): DoneMonthGroup[] {
  const map = new Map<string, { label: string; jobs: Job[] }>();
  for (const job of jobsSortedNewestFirst) {
    const { key, label } = monthKeyAndLabel(archiveDate(job));
    let g = map.get(key);
    if (!g) {
      g = { label, jobs: [] };
      map.set(key, g);
    }
    g.jobs.push(job);
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((key) => {
    const g = map.get(key)!;
    return { key, label: g.label, jobs: g.jobs };
  });
}
