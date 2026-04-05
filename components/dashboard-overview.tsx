import Link from 'next/link';
import type { DashboardSummary } from '@/lib/domain/dashboard-summary';
import { boardColumnTitle, DASHBOARD_COLUMNS } from '@/lib/domain/board-display';
import { fmtDetailDate, fmtUsd } from '@/lib/ticket/format';

type Props = {
  summary: DashboardSummary;
};

export function DashboardOverview({ summary: s }: Props) {
  const last = s.lastActivityAt ? fmtDetailDate(s.lastActivityAt) : '\u2014';

  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-3">
        <div className="col-12 col-sm-6 col-xl-3">
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
        <div className="col-12 col-sm-6 col-xl-3">
          <Link
            href="/dashboard/tickets"
            className="card border rounded-3 p-3 h-100 bg-body text-body text-decoration-none shadow-sm"
          >
            <div className="d-flex align-items-center gap-2 mb-2 text-body-secondary small text-uppercase fw-semibold">
              <i className="material-icons-outlined" style={{ fontSize: 18 }}>
                outbound
              </i>
              Leads
            </div>
            <p className="fs-3 fw-bold mb-0">{s.leadCount}</p>
            <p className="meta small mb-0 mt-1">Pre-quote (not on board)</p>
          </Link>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
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
        <div className="col-12 col-sm-6 col-xl-3">
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
              <div className="table-responsive">
                <table className="table table-sm table-borderless mb-0 align-middle">
                  <tbody>
                    {DASHBOARD_COLUMNS.map((col) => (
                      <tr key={col} className="border-bottom border-light">
                        <td className="text-body-secondary py-2">{boardColumnTitle(col)}</td>
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
                Integrations &amp; archive
              </h2>
              <ul className="list-unstyled mb-0 small">
                <li className="d-flex justify-content-between py-2 border-bottom border-light">
                  <span className="text-body-secondary">QuickBooks</span>
                  <span className={s.quickBooksConnected ? 'text-success fw-semibold' : 'text-warning'}>
                    {s.quickBooksConnected ? 'Connected' : 'Not connected'}
                  </span>
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
