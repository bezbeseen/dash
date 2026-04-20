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
import { loadQbTicketsToolbar } from '@/lib/domain/load-qb-tickets-toolbar';
import { fmtDetailDate } from '@/lib/ticket/format';

/** Always read fresh jobs from the DB (avoid any edge-case caching after CSV import / sync). */
export const dynamic = 'force-dynamic';

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
      orderBy: [
        { qbOrderingAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
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
            Sales to production to billing - one board. Cards are ordered by QuickBooks document time (estimate
            created, or invoice created if no estimate), not by last sync. Click a card to open the ticket.             Invoices
            you create{' '}
            <strong>without</strong> an estimate show under <strong>Ready / invoiced</strong> after sync (not Quoted).
            If one is missing, use <strong>Invoice # → Import</strong> in the toolbar (a few QuickBooks API calls only).
            {' '}
            <Link href="/dashboard/prequoted" className="text-decoration-underline">
              Pre-quote tickets
            </Link>
            {leadCount > 0 ? (
              <span className="board-topbar-leads">
                {' '}
                ({leadCount} in pre-quote: no sent estimate yet, or still syncing.)
              </span>
            ) : null}
          </p>
        </div>
        <div className="board-topbar-actions d-flex flex-wrap align-items-center gap-2">
          {qbToolbar.hasToken ? (
            <>
              <form action="/api/jobs/sync" method="post" className="d-inline">
                <button className="btn btn-toolbar" type="submit">
                  Sync from QuickBooks
                </button>
              </form>
              <form
                action="/api/jobs/import-invoice"
                method="post"
                className="d-flex flex-wrap align-items-center gap-1"
              >
                <label className="visually-hidden" htmlFor="import-invoice-doc">
                  Invoice number
                </label>
                <input
                  id="import-invoice-doc"
                  name="doc_number"
                  type="text"
                  className="form-control form-control-sm board-import-invoice-input"
                  placeholder="Invoice #"
                  autoComplete="off"
                  aria-label="QuickBooks invoice number"
                />
                <button className="btn btn-toolbar btn-sm" type="submit">
                  Import
                </button>
              </form>
            </>
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
