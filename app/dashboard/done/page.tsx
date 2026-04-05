import Link from 'next/link';
import { ArchiveReason } from '@prisma/client';
import { DoneJobRow } from '@/components/done-job-row';
import { groupDoneJobsByMonth } from '@/lib/domain/done-archive';
import { prisma } from '@/lib/db/prisma';

export default async function DashboardDonePage() {
  const jobs = await prisma.job.findMany({
    where: { archiveReason: ArchiveReason.DONE },
    orderBy: { archivedAt: 'desc' },
  });

  const months = groupDoneJobsByMonth(jobs);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Done</h1>
          <p className="board-topbar-sub">
            Tickets you marked <strong>Done</strong> — list view, grouped by the month they were archived. Nothing is
            written to QuickBooks from here.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/tickets" className="btn btn-toolbar">
            Tickets
          </Link>
        </div>
      </header>

      {jobs.length === 0 ? (
        <div className="flex-grow-1 p-4 p-md-5 text-body-secondary">
          <p className="meta mb-0">
            No done tickets yet. Mark a job <strong>Done</strong> from the board or ticket to list it here.
          </p>
        </div>
      ) : (
        <div
          data-archive-scroll
          className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4"
          style={{ minHeight: 0 }}
        >
          {months.map(({ key, label, jobs: monthJobs }) => (
            <section key={key} className="mb-4" aria-labelledby={`done-month-${key}`}>
              <h2
                id={`done-month-${key}`}
                className="h6 text-uppercase text-body-secondary fw-semibold small d-flex align-items-center justify-content-between gap-2 mb-0 pb-2 border-bottom"
              >
                <span>{label}</span>
                <span className="badge bg-body-secondary text-body rounded-pill">{monthJobs.length}</span>
              </h2>
              <ul className="list-group list-group-flush">
                {monthJobs.map((job) => (
                  <DoneJobRow key={job.id} job={job} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
