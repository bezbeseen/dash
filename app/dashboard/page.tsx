import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardHomeTodos } from '@/components/dashboard-home-todos';
import { DashboardOverview } from '@/components/dashboard-overview';
import { loadDashboardTodosModule } from '@/lib/domain/dashboard-home-todos';
import { loadDashboardSummary } from '@/lib/domain/dashboard-summary';
import { prisma } from '@/lib/db/prisma';
import { loadTodoAssigneeOptions } from '@/lib/todo/assignee-options';
import { todoFormErrorMessage } from '@/lib/todo/todo-form-errors';
import {
  loadProfitAndLossForDateRange,
  monthToDateRangeYmd,
  normalizePnlDateRange,
  quickBooksReportTimeZone,
  rollingLastDaysRangeYmd,
} from '@/lib/quickbooks/profit-loss';

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

function firstQueryString(
  q: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = q[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

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

  const todoErrorRaw = q.todo_error;
  const todoErrorCode =
    typeof todoErrorRaw === 'string' ? todoErrorRaw : Array.isArray(todoErrorRaw) ? todoErrorRaw[0] : undefined;
  const todoError = todoFormErrorMessage(todoErrorCode);

  const session = await getServerSession(authOptions);
  const sessionEmail = (session?.user?.email ?? '').toLowerCase() || null;

  const tz = quickBooksReportTimeZone();
  const defaultPnlRange = rollingLastDaysRangeYmd(30, new Date(), tz);
  const { start: pnlStart, end: pnlEnd } = normalizePnlDateRange(
    firstQueryString(q, 'from'),
    firstQueryString(q, 'to'),
    { start: defaultPnlRange.start, end: defaultPnlRange.end },
  );
  const mtdRange = monthToDateRangeYmd(new Date(), tz);
  const dashboardMtdHref =
    `/dashboard?from=${encodeURIComponent(mtdRange.start)}&to=${encodeURIComponent(mtdRange.end)}` as never;

  const qbToken = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });

  const [summary, todosModule, assigneeOptions, dashboardPnl] = await Promise.all([
    loadDashboardSummary(),
    loadDashboardTodosModule(sessionEmail, { upcomingLimit: 8 }),
    loadTodoAssigneeOptions(prisma, sessionEmail),
    qbToken ? loadProfitAndLossForDateRange(qbToken.realmId, pnlStart, pnlEnd) : Promise.resolve(null),
  ]);

  return (
    <div className="board-page dashboard-home">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Dashboard</h1>
          <p className="board-topbar-sub">
            Pipeline, money, ticket tasks, shop to-dos, and top customers. Open{' '}
            <Link href="/dashboard/tickets" className="text-decoration-underline">
              Tickets
            </Link>{' '}
            for the full board; sync QuickBooks from Tickets or any ticket.
          </p>
        </div>
      </header>

      <div
        className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4"
        style={{ minHeight: 0 }}
      >
        {todoError ? (
          <div className="pt-2 pb-1" role="alert">
            <div className="board-toast board-toast-error">{todoError}</div>
          </div>
        ) : null}
        <DashboardOverview
          summary={summary}
          dashboardPnl={dashboardPnl}
          pnlStart={pnlStart}
          pnlEnd={pnlEnd}
          dashboardMtdHref={dashboardMtdHref}
        />

        <DashboardHomeTodos module={todosModule} assigneeOptions={assigneeOptions} />

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
          <Link href="/dashboard/tasks" className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">checklist</i>
            </span>
            <span className="dashboard-home-card-title">Tasks</span>
            <span className="dashboard-home-card-desc">Ticket-linked to-dos</span>
          </Link>
          <Link href={'/dashboard/todos' as never} className="dashboard-home-card">
            <span className="dashboard-home-card-icon" aria-hidden>
              <i className="material-icons-outlined">event_note</i>
            </span>
            <span className="dashboard-home-card-title">To-dos</span>
            <span className="dashboard-home-card-desc">Shop list · assign &amp; due</span>
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
