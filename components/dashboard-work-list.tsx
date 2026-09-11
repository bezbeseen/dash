import Link from 'next/link';
import type { DashboardWorkList } from '@/lib/domain/dashboard-work-list';
import { DASHBOARD_WORK_LIST_LIMIT } from '@/lib/domain/dashboard-work-list';
import { fmtShortDate } from '@/lib/ticket/format';

type Props = {
  work: DashboardWorkList;
  leadCount: number;
};

export function DashboardWorkList({ work, leadCount }: Props) {
  const extra = work.totalOnBoard - work.rows.length;

  return (
    <section className="card border rounded-3 bg-body shadow-sm h-100">
      <div className="card-body pb-2">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
          <div>
            <h2 className="h6 fw-semibold mb-1 d-flex align-items-center gap-2">
              <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                view_list
              </i>
              Work
            </h2>
            <p className="small text-body-secondary mb-0">
              <span className="fw-semibold text-body">{work.totalOnBoard}</span> jobs on the board
              {leadCount > 0 ? (
                <>
                  {' '}
                  ·{' '}
                  <Link href="/dashboard/prequoted" className="text-decoration-underline">
                    {leadCount} pre-quote
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <Link href="/dashboard/tickets" className="btn btn-sm btn-outline-secondary">
            Board
          </Link>
        </div>
      </div>

      {work.rows.length === 0 ? (
        <p className="small text-body-secondary px-3 pb-3 mb-0">
          No production jobs yet.{' '}
          <Link href="/dashboard/tickets" className="text-decoration-underline">
            Sync from QuickBooks
          </Link>{' '}
          or triage{' '}
          <Link href="/dashboard/prequoted" className="text-decoration-underline">
            pre-quote tickets
          </Link>
          .
        </p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr className="small text-body-secondary">
                <th className="ps-3 fw-semibold">Job</th>
                <th className="fw-semibold">Status</th>
                <th className="fw-semibold">Date</th>
                <th className="fw-semibold">Tasks</th>
                <th className="pe-3 fw-semibold text-end">Updated</th>
              </tr>
            </thead>
            <tbody>
              {work.rows.map((row) => (
                <tr key={row.id}>
                  <td className="ps-3 py-2">
                    <Link
                      href={`/dashboard/jobs/${row.id}`}
                      className="text-decoration-none text-body fw-semibold d-block"
                    >
                      {row.title}
                    </Link>
                    {row.subtitle ? (
                      <div className="small text-body-secondary text-truncate" style={{ maxWidth: 280 }}>
                        {row.subtitle}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis fw-semibold">
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="py-2 small text-nowrap">
                    <div>{fmtShortDate(row.dateAt)}</div>
                    <div className="text-body-secondary">{row.dateLabel}</div>
                  </td>
                  <td className="py-2 small">
                    {row.openTasks === 0 ? (
                      <span className="text-body-secondary">—</span>
                    ) : (
                      <>
                        <span className={row.overdueTasks > 0 ? 'text-danger fw-semibold' : 'fw-semibold'}>
                          {row.openTasks} open
                        </span>
                        {row.overdueTasks > 0 ? (
                          <div className="text-danger">{row.overdueTasks} overdue</div>
                        ) : row.nextDueAt ? (
                          <div className="text-body-secondary">Due {fmtShortDate(row.nextDueAt)}</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="pe-3 py-2 small text-body-secondary text-end text-nowrap">
                    {fmtShortDate(row.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {extra > 0 ? (
        <div className="card-footer bg-body border-top small text-body-secondary">
          Showing {DASHBOARD_WORK_LIST_LIMIT} of {work.totalOnBoard}.{' '}
          <Link href="/dashboard/tickets" className="text-decoration-underline">
            See the rest on Tickets
          </Link>
          .
        </div>
      ) : null}
    </section>
  );
}
