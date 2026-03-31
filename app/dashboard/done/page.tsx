import Link from 'next/link';
import { ArchiveReason } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { JobCard } from '@/components/job-card';
import { fmtDetailDate } from '@/lib/ticket/format';

export default async function DashboardDonePage() {
  const jobs = await prisma.job.findMany({
    where: { archiveReason: ArchiveReason.DONE },
    orderBy: { archivedAt: 'desc' },
  });

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Done</h1>
          <p className="board-topbar-sub">
            Tickets you marked <strong>Done</strong> — off the production board, still in Dash. Nothing is written to
            QuickBooks from here.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard" className="btn btn-toolbar">
            Production board
          </Link>
        </div>
      </header>

      {jobs.length === 0 ? (
        <div className="done-archive-empty">
          <p className="meta">No done tickets yet. Mark a job <strong>Done</strong> from the board or ticket to list it here.</p>
        </div>
      ) : (
        <div className="done-archive-grid" role="list">
          {jobs.map((job) => (
            <div key={job.id} role="listitem">
              <JobCard
                job={job}
                extraMeta={job.archivedAt ? `Marked done ${fmtDetailDate(job.archivedAt)}` : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
