import Link from 'next/link';
import { QbCashDashboard } from '@/components/qb-cash-dashboard';
import { loadQbCashPageData } from '@/lib/domain/qb-cash-page';

export const dynamic = 'force-dynamic';

export default async function CashPage() {
  const data = await loadQbCashPageData();

  return (
    <div className="board-page qb-cash-page-root">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Cash &amp; banks</h1>
          <p className="board-topbar-sub">
            QuickBooks Online Chart of Accounts: every <strong>Bank</strong> account, balances, and how this differs
            from ticket-level accounting in Dash.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/accounting" className="btn btn-toolbar">
            Ticket accounting
          </Link>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      <div
        className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5"
        style={{ minHeight: 0 }}
      >
        <QbCashDashboard data={data} />
      </div>
    </div>
  );
}
