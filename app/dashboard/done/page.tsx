import Link from 'next/link';
import { ArchiveReason } from '@prisma/client';
import { DoneJobRow } from '@/components/done-job-row';
import { groupDoneJobsByMonth, sumDoneJobMoneyCents } from '@/lib/domain/done-archive';
import { prisma } from '@/lib/db/prisma';
import { fmtUsd } from '@/lib/ticket/format';

export default async function DashboardDonePage() {
  const jobs = await prisma.job.findMany({
    where: { archiveReason: ArchiveReason.DONE },
    orderBy: { archivedAt: 'desc' },
  });

  const months = groupDoneJobsByMonth(jobs);
  const grandTotals = sumDoneJobMoneyCents(jobs);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Done</h1>
          <p className="board-topbar-sub">
            Tickets you marked <strong>Done</strong> — grouped by the month they were archived, with subtotals per
            month and a grand total at the bottom. Nothing is written to QuickBooks from here.
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
          {months.map(({ key, label, jobs: monthJobs, totals: monthTotals }) => (
            <section key={key} className="mb-4 done-month-block" aria-labelledby={`done-month-${key}`}>
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
              <div
                className="done-month-subtotal d-flex flex-column flex-sm-row flex-wrap justify-content-between gap-2 py-2 px-3 small border-top text-body-secondary"
                aria-label={`${label} subtotal`}
              >
                <span className="fw-semibold text-body">Month subtotal</span>
                <span className="text-sm-start text-sm-end">
                  Est {fmtUsd(monthTotals.estimateCents)}
                  <span className="d-none d-sm-inline"> · </span>
                  <span className="d-sm-none">
                    <br />
                  </span>
                  Invoiced {fmtUsd(monthTotals.invoiceCents)}
                  <span className="d-none d-sm-inline"> · </span>
                  <span className="d-sm-none">
                    <br />
                  </span>
                  Paid {fmtUsd(monthTotals.paidCents)}
                </span>
              </div>
            </section>
          ))}

          <footer
            className="done-grand-total border rounded-3 px-3 py-3 mt-2 mb-2 bg-body-tertiary"
            aria-label="All done tickets totals"
          >
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-2">
              <div className="fw-semibold text-body">
                Total — {jobs.length} {jobs.length === 1 ? 'ticket' : 'tickets'}
              </div>
              <div className="small text-md-end text-body-secondary">
                Est <strong className="text-body">{fmtUsd(grandTotals.estimateCents)}</strong>
                <span className="d-none d-sm-inline"> · </span>
                <span className="d-sm-none">
                  <br />
                </span>
                Invoiced <strong className="text-body">{fmtUsd(grandTotals.invoiceCents)}</strong>
                <span className="d-none d-sm-inline"> · </span>
                <span className="d-sm-none">
                  <br />
                </span>
                Paid <strong className="text-body">{fmtUsd(grandTotals.paidCents)}</strong>
              </div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
