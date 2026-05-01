import Link from 'next/link';
import type { DashboardSummary } from '@/lib/domain/dashboard-summary';
import { boardColumnTitle, DASHBOARD_COLUMNS } from '@/lib/domain/board-display';
import { fmtDetailDate, fmtUsd } from '@/lib/ticket/format';

type Props = {
  summary: DashboardSummary;
};

export function DashboardOverview({ summary: s }: Props) {
  const last = s.lastActivityAt ? fmtDetailDate(s.lastActivityAt) : '\u2014';
  const qbSyncLabel = s.quickBooksLastSyncUnknown
    ? 'Run a sync after DB migrate'
    : s.quickBooksLastTicketSyncAt
      ? fmtDetailDate(s.quickBooksLastTicketSyncAt)
      : s.quickBooksConnected
        ? 'Not yet'
        : '\u2014';
  const pipelineMax = Math.max(...DASHBOARD_COLUMNS.map((col) => s.columnCounts[col]), 1);
  const taskTotal = s.ticketTasks.open + s.ticketTasks.done;
  const taskDoneRate = taskTotal > 0 ? Math.round((s.ticketTasks.done / taskTotal) * 100) : null;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-5 g-3">
        <div className="col">
          <Link
            href="/dashboard/tickets"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                view_kanban
              </i>
              On board
            </div>
            <p className="fs-3 fw-bold mb-0">{s.onBoardCount}</p>
            <p className="meta small mb-0 mt-1">Tickets in production columns</p>
          </Link>
        </div>
        <div className="col">
          <Link
            href="/dashboard/prequoted"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                outbound
              </i>
              Leads
            </div>
            <p className="fs-3 fw-bold mb-0">{s.leadCount}</p>
            <p className="meta small mb-0 mt-1">Pre-quote tickets</p>
          </Link>
        </div>
        <div className="col">
          <Link
            href="/dashboard/accounting"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                payments
              </i>
              Collected
            </div>
            <p className="fs-3 fw-bold mb-0">{fmtUsd(s.money.totalPaid)}</p>
            <p className="meta small mb-0 mt-1">Paid in across active tickets</p>
          </Link>
        </div>
        <div className="col">
          <Link
            href="/dashboard/accounting"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                account_balance_wallet
              </i>
              Outstanding
            </div>
            <p className="fs-3 fw-bold mb-0">{fmtUsd(s.money.outstanding)}</p>
            <p className="meta small mb-0 mt-1">Open invoice balance</p>
          </Link>
        </div>
        <div className="col">
          <Link
            href="/dashboard/tickets"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                folder_special
              </i>
              Drive folders
            </div>
            <p className="fs-3 fw-bold mb-0">{s.driveFoldersLinkedCount}</p>
            <p className="meta small mb-0 mt-1">Active tickets with a linked folder</p>
          </Link>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-4">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
                <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                  account_balance
                </i>
                Financial snapshot
              </h2>
              <p className="small text-body-secondary mb-3">
                Active tickets only — same rollups as{' '}
                <Link href="/dashboard/accounting" className="text-decoration-underline">
                  Accounting
                </Link>
                .
              </p>
              <ul className="list-unstyled mb-0 small">
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Invoiced</span>
                  <span className="fw-semibold">{fmtUsd(s.money.totalInvoiced)}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Collected</span>
                  <span className="fw-semibold">{fmtUsd(s.money.totalPaid)}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Outstanding</span>
                  <span className="fw-semibold">{fmtUsd(s.money.outstanding)}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Tickets with open balance</span>
                  <span className="fw-semibold">{s.money.withOpenBalance}</span>
                </li>
                <li className="d-flex justify-content-between py-2">
                  <span className="text-body-secondary">Paid in full (active)</span>
                  <span className="fw-semibold">{s.money.paidInFull}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
                <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                  checklist
                </i>
                Ticket tasks
              </h2>
              <p className="small text-body-secondary mb-3">
                Tasks linked to active tickets. Shop-wide list is on{' '}
                <Link href="/dashboard/todos" className="text-decoration-underline">
                  To-dos
                </Link>
                .
              </p>
              <ul className="list-unstyled mb-3 small">
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Open</span>
                  <span className="fw-semibold">{s.ticketTasks.open}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Done</span>
                  <span className="fw-semibold">{s.ticketTasks.done}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Overdue (open + past due)</span>
                  <span className={s.ticketTasks.overdue > 0 ? 'fw-semibold text-danger' : 'fw-semibold'}>
                    {s.ticketTasks.overdue}
                  </span>
                </li>
                {taskDoneRate != null ? (
                  <li className="d-flex justify-content-between py-2">
                    <span className="text-body-secondary">Completion (done / total)</span>
                    <span className="fw-semibold">{taskDoneRate}%</span>
                  </li>
                ) : null}
              </ul>
              <Link href="/dashboard/tasks" className="btn btn-sm btn-outline-secondary">
                Manage ticket tasks
              </Link>
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
                <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                  groups
                </i>
                Top customers
              </h2>
              <p className="small text-body-secondary mb-3">
                By invoiced total on active tickets (name from QuickBooks).
              </p>
              {s.topCustomers.length === 0 ? (
                <p className="small text-body-secondary mb-0">No active tickets yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-borderless mb-0 align-middle">
                    <thead>
                      <tr className="small text-body-secondary">
                        <th className="fw-semibold border-bottom border-light py-2">Customer</th>
                        <th className="fw-semibold border-bottom border-light py-2 text-end">Jobs</th>
                        <th className="fw-semibold border-bottom border-light py-2 text-end">Invoiced</th>
                        <th className="fw-semibold border-bottom border-light py-2 text-end">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.topCustomers.map((row) => (
                        <tr key={row.customerName} className="border-bottom border-light">
                          <td className="py-2 small text-truncate" style={{ maxWidth: 140 }} title={row.customerName}>
                            {row.customerName}
                          </td>
                          <td className="py-2 text-end fw-semibold">{row.jobCount}</td>
                          <td className="py-2 text-end small">{fmtUsd(row.invoicedCents)}</td>
                          <td className="py-2 text-end small">{fmtUsd(row.paidCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
                <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                  stacked_bar_chart
                </i>
                Board by column
              </h2>
              <p className="small text-body-secondary mb-3">
                Relative bar width shows share of the busiest column — useful for spotting backlog.
              </p>
              <div className="table-responsive">
                <table className="table table-sm table-borderless mb-0 align-middle">
                  <tbody>
                    {DASHBOARD_COLUMNS.map((col) => (
                      <tr key={col} className="border-bottom border-light">
                        <td className="text-body-secondary py-2" style={{ width: '38%' }}>
                          {boardColumnTitle(col)}
                        </td>
                        <td className="py-2" style={{ minWidth: 100 }}>
                          <div
                            className="progress rounded-pill"
                            style={{ height: 10 }}
                            role="presentation"
                            aria-hidden
                          >
                            <div
                              className="progress-bar bg-primary"
                              style={{ width: `${(s.columnCounts[col] / pipelineMax) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="text-end fw-semibold py-2">{s.columnCounts[col]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link href="/dashboard/tickets" className="btn btn-sm btn-outline-secondary mt-3">
                Open tickets
              </Link>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
                <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                  hub
                </i>
                Integrations, Drive &amp; archive
              </h2>
              <ul className="list-unstyled mb-0 small">
                <li className="py-2 border-bottom border-light">
                  <div className="d-flex justify-content-between align-items-baseline gap-2">
                    <span className="text-body-secondary">QuickBooks</span>
                    <span className={s.quickBooksConnected ? 'text-success fw-semibold' : 'text-warning'}>
                      {s.quickBooksConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <p className="mb-0 mt-1 text-body-secondary">
                    Last manual board sync: <span className="text-body">{qbSyncLabel}</span>
                  </p>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Google Drive on tickets</span>
                  <span className="fw-semibold">{s.driveFoldersLinkedCount} linked</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Gmail mailboxes</span>
                  <span className="fw-semibold">{s.gmailMailboxCount}</span>
                </li>
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">Done (archived)</span>
                  <Link href="/dashboard/done" className="fw-semibold">
                    {s.doneCount}
                  </Link>
                </li>
                <li className="d-flex justify-content-between py-2">
                  <span className="text-body-secondary">Active ticket rows</span>
                  <span className="fw-semibold">{s.money.ticketCount}</span>
                </li>
              </ul>
              <div className="d-flex flex-wrap gap-2 mt-3">
                <Link href="/dashboard/settings" className="btn btn-sm btn-outline-secondary">
                  Settings
                </Link>
                <Link href="/dashboard/done" className="btn btn-sm btn-outline-secondary">
                  Done list
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-body-secondary small mb-0">
        <span className="text-uppercase fw-semibold me-1">Last ticket update</span>
        {last}
      </p>
    </div>
  );
}
