import { BoardStatus } from '@prisma/client';
import Link from 'next/link';
import { JobCard } from '@/components/job-card';
import { prisma } from '@/lib/db/prisma';
import { loadQbTicketsToolbar } from '@/lib/domain/load-qb-tickets-toolbar';
import {
  jobErrorFromQuery,
  syncToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import { fmtDetailDate } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';

const PREQUOTE_PAGE_LIMIT = 500;

type PrequotedPageProps = {
  searchParams: Promise<{
    synced?: string;
    sync_error?: string;
    job_error?: string;
    cleared?: string;
  }>;
};

export default async function PrequotedTicketsPage({ searchParams }: PrequotedPageProps) {
  const [jobs, totalCount, qbToolbar] = await Promise.all([
    prisma.job.findMany({
      where: { archivedAt: null, boardStatus: BoardStatus.REQUESTED },
      orderBy: [
        { qbOrderingAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      take: PREQUOTE_PAGE_LIMIT,
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

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Pre-quote tickets</h1>
          <p className="board-topbar-sub">
            Leads before a <strong>sent</strong> estimate lands in QuickBooks (or still syncing). Invoice-only work
            normally skips this list and shows on the main{' '}
            <Link href="/dashboard/tickets" className="text-decoration-underline">
              Tickets
            </Link>{' '}
            board under <strong>Ready / invoiced</strong>.
            {totalCount > jobs.length ? (
              <span className="board-topbar-leads">
                {' '}
                Showing {jobs.length} of {totalCount}
                {' '}
                - narrow in QuickBooks or raise the cap in code if needed.
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
                <label className="visually-hidden" htmlFor="import-invoice-doc-prequoted">
                  Invoice number
                </label>
                <input
                  id="import-invoice-doc-prequoted"
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
          <Link href="/dashboard/tickets" className="btn btn-toolbar btn-toolbar-muted">
            Main board
          </Link>
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

      <section className="board-leads px-3 px-md-4 pb-4" aria-labelledby="prequoted-heading">
        <h2 id="prequoted-heading" className="h6 fw-semibold mb-2">
          Pre-quote ({totalCount})
        </h2>
        <p className="small text-body-secondary mb-3">
          These rows use board status <strong>Lead</strong> until QuickBooks shows a sent estimate (or invoice-only
          rules move them elsewhere).
        </p>
        {jobs.length === 0 ? (
          <p className="text-body-secondary small">No pre-quote tickets right now.</p>
        ) : (
          <div className="board-leads-grid d-flex flex-column gap-2" style={{ maxWidth: '28rem' }}>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
