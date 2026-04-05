import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard-overview';
import { loadDashboardSummary } from '@/lib/domain/dashboard-summary';

const SETTINGS_QUERY_KEYS = [
  'qb_connected',
  'qb_error',
  'qb_error_detail',
  'gmail_connected',
  'gmail_error',
] as const;

const TICKETS_QUERY_KEYS = ['synced', 'sync_error', 'job_error', 'cleared'] as const;

export const dynamic = 'force-dynamic';

type DashboardHomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardHome({ searchParams }: DashboardHomeProps) {
  const q = await searchParams;
  const settingsFlat = new URLSearchParams();
  for (const key of SETTINGS_QUERY_KEYS) {
    const v = q[key];
    if (v === undefined) continue;
    const s = Array.isArray(v) ? v[0] : v;
    if (s) settingsFlat.set(key, s);
  }
  if (settingsFlat.toString()) {
    redirect(`/dashboard/settings?${settingsFlat.toString()}`);
  }
  const ticketsFlat = new URLSearchParams();
  for (const key of TICKETS_QUERY_KEYS) {
    const v = q[key];
    if (v === undefined) continue;
    const s = Array.isArray(v) ? v[0] : v;
    if (s) ticketsFlat.set(key, s);
  }
  if (ticketsFlat.toString()) {
    redirect(`/dashboard/tickets?${ticketsFlat.toString()}`);
  }

  const summary = await loadDashboardSummary();

  return (
    <div className="board-page dashboard-home">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Dashboard</h1>
          <p className="board-topbar-sub">
            Live summary of the board, collections, open balances, and integrations. Layout matches the rest of Dash
            (Bootstrap cards + Material icons, vertical shell).
          </p>
        </div>
      </header>

      <div
        className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4"
        style={{ minHeight: 0 }}
      >
        <DashboardOverview summary={summary} />

        <h2 className="h6 text-body-secondary text-uppercase fw-semibold small mt-4 mb-3">Shortcuts</h2>
        <div className="dashboard-home-grid">
          <Link href="/dashboard/tickets" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">confirmation_number</i>
            </span>
            <span className="dashboard-home-card-title">Tickets</span>
            <span className="dashboard-home-card-desc">Production board</span>
          </Link>
          <Link href="/dashboard/accounting" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">account_balance</i>
            </span>
            <span className="dashboard-home-card-title">Accounting</span>
            <span className="dashboard-home-card-desc">Ticket money rollups</span>
          </Link>
          <Link href="/dashboard/cash" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">account_balance_wallet</i>
            </span>
            <span className="dashboard-home-card-title">Cash &amp; banks</span>
            <span className="dashboard-home-card-desc">QBO chart of accounts</span>
          </Link>
          <Link href="/dashboard/activity" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">history</i>
            </span>
            <span className="dashboard-home-card-title">Activity</span>
            <span className="dashboard-home-card-desc">Board &amp; sync events</span>
          </Link>
          <Link href="/dashboard/gbp" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">insights</i>
            </span>
            <span className="dashboard-home-card-title">GBP metrics</span>
            <span className="dashboard-home-card-desc">Profile performance (30 days)</span>
          </Link>
          <Link href="/dashboard/settings" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">settings</i>
            </span>
            <span className="dashboard-home-card-title">Settings</span>
            <span className="dashboard-home-card-desc">QuickBooks &amp; Gmail</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
