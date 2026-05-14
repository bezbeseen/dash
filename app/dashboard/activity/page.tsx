import Link from 'next/link';
import { ActivityFeed } from '@/components/activity-feed';
import {
  loadRecentActions,
  REVIEW_REQUEST_EMAIL_ACTIVITY_PREFIX,
} from '@/lib/domain/dashboard-summary';

export const dynamic = 'force-dynamic';

const ACTIVITY_PAGE_LIMIT = 100;

type ActivityPageProps = {
  searchParams: Promise<{ kind?: string | string[] }>;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const q = await searchParams;
  const kindRaw = q.kind;
  const kind = Array.isArray(kindRaw) ? kindRaw[0] : kindRaw;
  const reviewEmailOnly = kind === 'review_email';
  const actions = await loadRecentActions(
    ACTIVITY_PAGE_LIMIT,
    reviewEmailOnly ? { eventNamePrefix: REVIEW_REQUEST_EMAIL_ACTIVITY_PREFIX } : undefined,
  );

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Activity</h1>
          <p className="board-topbar-sub">
            {reviewEmailOnly ? (
              <>
                Review request email events (auto send after Done, manual resend, skips, failures). Showing up to{' '}
                {ACTIVITY_PAGE_LIMIT} entries.
              </>
            ) : (
              <>
                Latest events from board actions, QuickBooks sync, Gmail, and review request emails. Showing up to{' '}
                {ACTIVITY_PAGE_LIMIT} entries.
              </>
            )}
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/tickets" className="btn btn-toolbar">
            Tickets
          </Link>
          <Link href="/dashboard" className="btn btn-toolbar btn-toolbar-muted">
            Dashboard
          </Link>
        </div>
      </header>

      <div
        className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4"
        style={{ minHeight: 0 }}
      >
        <div className="card border rounded-3 bg-body shadow-sm">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
              <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
                history
              </i>
              Recent activity
            </h2>
            {reviewEmailOnly ? (
              <p className="small mb-3">
                <Link href="/dashboard/activity" className="text-decoration-underline">
                  Show all activity
                </Link>
              </p>
            ) : null}
            <p className="text-body-secondary small mb-3">
              Logged automatically when you use production buttons on a ticket, sync from QuickBooks, connect Gmail, or
              send review request emails. For QuickBooks estimate/invoice sync, the <strong>QuickBooks</strong> date is
              the transaction date from QBO; <strong>Recorded in Dash</strong> is when this app wrote the log. Open a row
              to jump to that ticket.
            </p>
            <ActivityFeed actions={actions} />
          </div>
        </div>
      </div>
    </div>
  );
}
