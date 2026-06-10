import { BoardStatus } from '@prisma/client';
import Link from 'next/link';
import { JobCard } from '@/components/job-card';
import { PrequoteBoardFilters } from '@/components/prequote-board-filters';
import { TicketBoardBadgeLegend } from '@/components/ticket-board-badge-legend';
import { prisma } from '@/lib/db/prisma';
import { taskCountsByJobId } from '@/lib/domain/job-task-counts';
import { loadQbTicketsToolbar } from '@/lib/domain/load-qb-tickets-toolbar';
import {
  jobErrorFromQuery,
  syncToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import {
  parsePrequoteSourceFilter,
  PREQUOTE_COLUMNS,
  prequoteColumnHint,
  prequoteColumnTitle,
  triagePrequoteJobs,
} from '@/lib/domain/prequote-triage';
import { WorkflowTabsBar } from '@/components/workflow-tabs-bar';
import { fmtDetailDate } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';

const PREQUOTE_PAGE_LIMIT = 500;

type PrequotedPageProps = {
  searchParams: Promise<{
    synced?: string;
    sync_error?: string;
    job_error?: string;
    cleared?: string;
    source?: string;
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
  const taskByJob = await taskCountsByJobId(jobs.map((j) => j.id));
  const lastTicketSyncAt = qbToolbar.lastTicketSyncAt;

  const q = await searchParams;
  const sourceFilter = parsePrequoteSourceFilter(q.source);
  const { synced, syncError } = syncToastFromQuery(q);
  const jobError = jobErrorFromQuery(q);
  const cleared = q.cleared === '1';

  const { substanceByJobId, byColumn, filteredCount } = triagePrequoteJobs(jobs, sourceFilter);
  const thinCount = [...substanceByJobId.values()].filter((s) => s.thin).length;

  return (
    <div className="board-page">
      <WorkflowTabsBar />
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Pre-quote tickets</h1>
          <p className="board-topbar-sub">
            Triage leads before a <strong>sent</strong> estimate lands in QuickBooks. Columns sort by age and substance
            — <strong>Thin</strong> flags short conversations with no contact detail. Use{' '}
            <strong>Dismiss</strong> for junk and <strong>Lost</strong> for real dead leads. Main{' '}
            <Link href="/dashboard/tickets" className="text-decoration-underline">
              Tickets
            </Link>{' '}
            board is for quoted work onward.
            {totalCount > jobs.length ? (
              <span className="board-topbar-leads">
                {' '}
                Showing {jobs.length} of {totalCount} — raise the cap in code if needed.
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

      <PrequoteBoardFilters source={sourceFilter} counts={{ total: filteredCount, thin: thinCount }} />

      {filteredCount === 0 ? (
        <p className="text-body-secondary small px-3 px-md-4 pb-4">
          No pre-quote tickets match this filter.
        </p>
      ) : (
        <div className="board-canvas prequote-board-canvas">
          {PREQUOTE_COLUMNS.map((column) => {
            const columnJobs = byColumn[column];
            return (
              <section className="board-list prequote-board-list" key={column}>
                <div className="board-list-head">
                  <div>
                    <h2 className="board-list-title">{prequoteColumnTitle(column)}</h2>
                    <p className="prequote-column-hint small text-body-secondary mb-0">
                      {prequoteColumnHint(column)}
                    </p>
                  </div>
                  <span className="board-list-count">{columnJobs.length}</span>
                </div>
                <div className="board-list-body">
                  {columnJobs.length === 0 ? (
                    <p className="small text-body-secondary mb-0 px-1">None right now.</p>
                  ) : (
                    columnJobs.map((job) => {
                      const full = jobs.find((j) => j.id === job.id)!;
                      return (
                        <JobCard
                          key={job.id}
                          job={full}
                          leadSubstance={substanceByJobId.get(job.id) ?? null}
                          taskCounts={taskByJob.get(job.id) ?? { open: 0, done: 0 }}
                          updatedAfterLastTicketSync={
                            lastTicketSyncAt != null && full.updatedAt > lastTicketSyncAt
                          }
                        />
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TicketBoardBadgeLegend />
    </div>
  );
}
