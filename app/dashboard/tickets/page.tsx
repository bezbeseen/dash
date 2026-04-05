import { BoardStatus } from '@prisma/client';
import Link from 'next/link';
import { JobCard } from '@/components/job-card';
import { prisma } from '@/lib/db/prisma';
import {
  boardColumnTitle,
  DASHBOARD_COLUMNS,
  jobMatchesDashboardColumn,
  type DashboardColumnKey,
} from '@/lib/domain/board-display';
import {
  jobErrorFromQuery,
  syncToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import { fmtDetailDate } from '@/lib/ticket/format';

/** Always read fresh jobs from the DB (avoid any edge-case caching after CSV import / sync). */
export const dynamic = 'force-dynamic';

type QbTicketsToolbar = {
  hasToken: boolean;
  lastTicketSyncAt: Date | null;
  lastSyncUnknown: boolean;
};

/** Loads QB connection + last manual sync time; survives DBs that have not run the lastTicketSyncAt migration yet. */
async function loadQbTicketsToolbar(): Promise<QbTicketsToolbar> {
  try {
    const row = await prisma.quickBooksToken.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { lastTicketSyncAt: true },
    });
    if (!row) return { hasToken: false, lastTicketSyncAt: null, lastSyncUnknown: false };
    return { hasToken: true, lastTicketSyncAt: row.lastTicketSyncAt, lastSyncUnknown: false };
  } catch {
    try {
      const row = await prisma.quickBooksToken.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      return {
        hasToken: row != null,
        lastTicketSyncAt: null,
        lastSyncUnknown: row != null,
      };
    } catch {
      return { hasToken: false, lastTicketSyncAt: null, lastSyncUnknown: false };
    }
  }
}

type TicketsPageProps = {
  searchParams: Promise<{
    synced?: string;
    sync_error?: string;
    job_error?: string;
    cleared?: string;
  }>;
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const [jobs, leadCount, qbToolbar] = await Promise.all([
    prisma.job.findMany({
      where: { archivedAt: null, boardStatus: { not: BoardStatus.REQUESTED } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.job.count({
      where: { archivedAt: null, boardStatus: BoardStatus.REQUESTED },
    }),
    loadQbTicketsToolbar(),
  ]);
  const q = await searchParams;
  const { synced, syncError } = syncToastFromQuery(q);
  const jobError = jobErrorFromQuery(q);
  const cleared = q.cleared === '1';

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
          <h1 className="board-topbar-title">Tickets</h1>
          <p className="board-topbar-sub">
            Sales to production to billing - one board. Click a card to open the ticket.
            {leadCount > 0 ? (
              <>
                {' '}
                <span className="board-topbar-leads">
                  {leadCount} pre-quote lead{leadCount === 1 ? '' : 's'} not shown - send the estimate from
                  QuickBooks to land in <strong>Quoted</strong>.
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="board-topbar-actions d-flex flex-wrap align-items-center gap-2">
          {qbToolbar.hasToken ? (
            <form action="/api/jobs/sync" method="post">
              <button className="btn btn-toolbar" type="submit">
                Sync from QuickBooks
              </button>
            </form>
          ) : (
            <Link href="/dashboard/settings" className="btn btn-toolbar">
              Connect QuickBooks
            </Link>
          )}
          <span className="small text-body-secondary text-md-end board-topbar-sync-meta">
            {qbToolbar.lastSyncUnknown
              ? 'Last sync: deploy DB migration (npx prisma migrate deploy), then reload'
              : qbToolbar.lastTicketSyncAt
                ? `Last sync ${fmtDetailDate(qbToolbar.lastTicketSyncAt)}`
                : qbToolbar.hasToken
                  ? 'Last sync: not yet (run Sync from QuickBooks once)'
                  : 'Last sync: connect QuickBooks first'}
          </span>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      {(syncError || jobError || synced || cleared) && (
        <div className="board-toasts" role="status">
          {syncError ? (
            <div className="board-toast board-toast-error">QuickBooks sync error: {syncError}</div>
          ) : null}
          {jobError ? <div className="board-toast board-toast-error">{jobError}</div> : null}
          {synced ? (
            <div className="board-toast board-toast-ok">Synced latest estimates/invoices from QuickBooks.</div>
          ) : null}
          {cleared ? (
            <div className="board-toast board-toast-ok">Local jobs cleared (dev).</div>
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
