import { prisma } from '@/lib/db/prisma';
import {
  THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS,
  THREAD_RESYNC_DEFAULT_MAX_JOBS,
} from '@/lib/gmail/match-threads-bulk';
import { THREAD_MATCH_DEFAULT_LOOKBACK_DAYS } from '@/lib/gmail/thread-match';

/**
 * Bulk entry point for the thread matcher. Hobby crons only fire once a day, so this is a
 * button rather than a schedule.
 */
export async function GmailThreadMatchSettingsSection() {
  const [mailboxCount, unlinkedCount, linkedCount, autoLinkedCount] = await Promise.all([
    prisma.gmailConnection.count(),
    prisma.job.count({ where: { gmailThreadId: null, archivedAt: null } }),
    prisma.job.count({ where: { gmailThreadId: { not: null }, archivedAt: null } }),
    prisma.job.count({ where: { gmailLinkSource: 'AUTO' } }),
  ]);

  const ready = mailboxCount > 0;

  return (
    <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
      <h2 className="h6 fw-semibold mb-2">Gmail threads → tickets</h2>
      <p className="small text-body-secondary mb-3">
        Searches the connected mailboxes for correspondence with each ticket&apos;s customer and attaches the thread when
        exactly one candidate matches an email address Dash already holds for that ticket. Anything weaker or ambiguous is
        left as a ranked suggestion on the ticket, so a wrong customer&apos;s mail never lands on a job silently.
      </p>

      <p className="small mb-3">
        <strong>{mailboxCount}</strong> mailbox{mailboxCount === 1 ? '' : 'es'} connected ·{' '}
        <strong>{unlinkedCount}</strong> ticket{unlinkedCount === 1 ? '' : 's'} with no thread ·{' '}
        <strong>{linkedCount}</strong> linked (<strong>{autoLinkedCount}</strong> matched automatically).
      </p>

      <div className="d-flex flex-wrap gap-2 align-items-center">
        <a
          className="btn btn-toolbar btn-toolbar-muted"
          href={`/api/integrations/gmail/match-threads?max=${THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS}&days=${THREAD_MATCH_DEFAULT_LOOKBACK_DAYS}`}
          target="_blank"
          rel="noreferrer"
          title="Dry run: per-ticket reasoning, writes nothing"
        >
          Preview thread matches
        </a>
        <form action="/api/integrations/gmail/match-threads" method="post">
          <button className="btn btn-toolbar" type="submit" disabled={!ready}>
            Link email threads
          </button>
        </form>
        <form action="/api/integrations/gmail/resync-threads" method="post">
          <button className="btn btn-toolbar btn-toolbar-muted" type="submit" disabled={!ready}>
            Re-sync linked threads
          </button>
        </form>
      </div>

      {!ready ? (
        <p className="small text-body-secondary mt-2 mb-0">
          Connect a mailbox under Gmail above before running this.
        </p>
      ) : (
        <p className="small text-body-secondary mt-2 mb-0">
          One run covers the {THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS} most recently updated unlinked tickets over the last{' '}
          {THREAD_MATCH_DEFAULT_LOOKBACK_DAYS} days; re-sync covers the {THREAD_RESYNC_DEFAULT_MAX_JOBS} most recently
          updated linked ones. Add <code className="detail-mono">?max=12&amp;days=365</code> to the preview URL to widen it.
          Bulk linking does not download messages — use Re-sync linked threads for that.
        </p>
      )}
    </section>
  );
}
