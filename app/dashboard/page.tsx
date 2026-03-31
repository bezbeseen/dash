import { BoardStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/** Always read fresh jobs from SQLite (avoid any edge-case caching after CSV import / sync). */
export const dynamic = 'force-dynamic';
import { JobCard } from '@/components/job-card';
import {
  boardColumnTitle,
  DASHBOARD_COLUMNS,
  jobMatchesDashboardColumn,
  type DashboardColumnKey,
} from '@/lib/domain/board-display';

type DashboardPageProps = {
  searchParams: Promise<{
    synced?: string;
    sync_error?: string;
    qb_connected?: string;
    job_error?: string;
    gmail_connected?: string;
    gmail_error?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [jobs, leadCount] = await Promise.all([
    prisma.job.findMany({
      where: { archivedAt: null, boardStatus: { not: BoardStatus.REQUESTED } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.job.count({
      where: { archivedAt: null, boardStatus: BoardStatus.REQUESTED },
    }),
  ]);
  const q = await searchParams;
  const qbConnected = q.qb_connected === '1';
  const synced = q.synced === '1';
  const syncError = q.sync_error ? decodeURIComponent(q.sync_error) : null;
  const jobError =
    q.job_error === 'blocked'
      ? 'That action isn’t available for this ticket (e.g. it’s off the board).'
      : q.job_error === 'archive'
        ? 'Could not remove that ticket — it may already be off the board.'
        : null;

  const gmailConnected = q.gmail_connected === '1';
  const gmailError =
    q.gmail_error === 'config'
      ? 'Gmail: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env (REDIRECT_URI is optional — see README)'
      : q.gmail_error === 'denied'
        ? 'Gmail sign-in was cancelled.'
        : q.gmail_error === 'no_refresh'
          ? 'Gmail did not return a refresh token. Disconnect the app in Google Account → Security and try Connect again.'
          : q.gmail_error === 'no_profile'
            ? 'Could not read Gmail profile after connect.'
            : q.gmail_error === 'gmail_api'
              ? 'Gmail API blocked this account (403). In the same Google Cloud project as your OAuth client: APIs & Services → Library → enable Gmail API → Save. Wait a few minutes, then Connect Gmail again.'
              : q.gmail_error === 'gmail_profile'
                ? 'Gmail could not load your mailbox profile after sign-in. Try again; if it persists, enable Gmail API on the project and add yourself as a test user on the OAuth consent screen.'
              : q.gmail_error === 'token'
                ? 'Gmail token exchange failed — check .env client ID/secret and that the redirect URI in Google Cloud matches this app.'
              : q.gmail_error === 'no_code'
                ? 'Gmail OAuth missing code.'
                : q.gmail_error === 'max_mailboxes'
                  ? 'Gmail: max 3 mailboxes. Connect only new addresses from the sidebar, or delete a GmailConnection row in Prisma Studio to free a slot.'
                  : null;

  const counts = Object.fromEntries(
    DASHBOARD_COLUMNS.map((col) => [
      col,
      jobs.filter((j) => jobMatchesDashboardColumn(j, col)).length,
    ]),
  ) as Record<DashboardColumnKey, number>;

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Production board</h1>
          <p className="board-topbar-sub">
            Sales → production → billing — one board. Click a card to open the ticket.
            {leadCount > 0 ? (
              <>
                {' '}
                <span className="board-topbar-leads">
                  {leadCount} pre-quote lead{leadCount === 1 ? '' : 's'} not shown — send the estimate from
                  QuickBooks to land in <strong>Quoted</strong>.
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="board-topbar-actions">
          <a className="btn btn-toolbar" href="/api/integrations/quickbooks/connect">
            Connect QuickBooks
          </a>
          <form action="/api/jobs/sync" method="post">
            <button className="btn btn-toolbar" type="submit">
              Sync from QuickBooks
            </button>
          </form>
          <form action="/api/jobs/sync/demo" method="post">
            <button
              className="btn btn-toolbar btn-toolbar-muted"
              type="submit"
              title="Adds fake cards for UI testing only"
            >
              Demo data
            </button>
          </form>
        </div>
      </header>

      {(syncError || jobError || gmailError || qbConnected || synced || gmailConnected) && (
        <div className="board-toasts" role="status">
          {syncError ? (
            <div className="board-toast board-toast-error">QuickBooks sync error: {syncError}</div>
          ) : null}
          {jobError ? <div className="board-toast board-toast-error">{jobError}</div> : null}
          {gmailError ? <div className="board-toast board-toast-error">{gmailError}</div> : null}
          {qbConnected ? <div className="board-toast board-toast-ok">QuickBooks connected.</div> : null}
          {gmailConnected ? <div className="board-toast board-toast-ok">Gmail connected.</div> : null}
          {synced ? (
            <div className="board-toast board-toast-ok">Synced latest estimates/invoices from QuickBooks.</div>
          ) : null}
        </div>
      )}

      <div className="board-canvas">
        {DASHBOARD_COLUMNS.map((column) => {
          const columnJobs = jobs.filter((job) => jobMatchesDashboardColumn(job, column));
          return (
            <section className="board-list" key={column}>
              <div className="board-list-head">
                <h2 className="board-list-title">{boardColumnTitle(column)}</h2>
                <span className="board-list-count">{counts[column]}</span>
              </div>
              <div className="board-list-body">
                {columnJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
              <div className="board-list-footer">
                <button type="button" className="board-list-add" disabled title="Coming soon">
                  + Add ticket
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
