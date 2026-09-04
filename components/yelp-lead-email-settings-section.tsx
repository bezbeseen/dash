import { prisma } from '@/lib/db/prisma';
import {
  YELP_SCAN_DEFAULT_LOOKBACK_DAYS,
  YELP_SCAN_DEFAULT_MAX_MESSAGES,
  YELP_SCAN_MAX_LOOKBACK_DAYS,
  YELP_SCAN_MAX_MESSAGES,
} from '@/lib/yelp/scan-limits';
import { resolveYelpLeadMailboxState } from '@/lib/yelp/lead-mailbox';

/**
 * Yelp's Leads API is gated to advertising resellers, so Dash ingests Yelp
 * "Request a Quote" notifications out of the connected mailbox instead.
 */
export async function YelpLeadEmailSettingsSection() {
  const mailbox = await resolveYelpLeadMailboxState(null);
  const importedCount = await prisma.job.count({ where: { inboundLeadKind: 'YELP_LEAD' } });

  return (
    <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
      <h2 className="h6 fw-semibold mb-2">Yelp leads → pre-quote tickets</h2>
      <p className="small text-body-secondary mb-3">
        Yelp&apos;s Leads API is limited to advertising resellers with a minimum spend, so Dash reads Yelp&apos;s
        &quot;Request a Quote&quot; notification emails from a connected mailbox instead. Each new lead becomes a
        Requested ticket, deduped on Yelp&apos;s conversation id so re-scanning is safe. Every run reports what it
        examined, how many were customer leads, how many already had tickets and how many tickets it created.
      </p>

      <p className="small mb-1">
        Scanning: <code className="detail-mono">{mailbox.mailbox}</code>{' '}
        {mailbox.connected ? (
          <span className="text-success fw-semibold">· connected</span>
        ) : (
          <span className="text-warning fw-semibold">· not connected</span>
        )}
      </p>
      <p className="small text-body-secondary mb-3">
        Chosen from <strong>{mailbox.source}</strong>.{' '}
        {mailbox.fromEnv ? null : (
          <>
            Set <code className="detail-mono">YELP_LEAD_EMAIL_MAILBOX</code> to override.{' '}
          </>
        )}
        Tickets imported so far: <strong>{importedCount}</strong>.
      </p>

      {mailbox.reason ? <div className="alert alert-warning small py-2 px-3">{mailbox.reason}</div> : null}

      <div className="d-flex flex-wrap gap-2 align-items-center">
        <a
          className="btn btn-toolbar btn-toolbar-muted"
          href={`/api/integrations/yelp/scan-emails?days=${YELP_SCAN_DEFAULT_LOOKBACK_DAYS}`}
          target="_blank"
          rel="noreferrer"
          title="Dry run: last 14 days, writes nothing"
        >
          Preview matches
        </a>
        <form
          action={`/api/integrations/yelp/scan-emails?days=${YELP_SCAN_DEFAULT_LOOKBACK_DAYS}`}
          method="post"
        >
          <button className="btn btn-toolbar" type="submit" disabled={!mailbox.ready}>
            Import Yelp leads
          </button>
        </form>
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-center mt-2">
        <a
          className="btn btn-toolbar btn-toolbar-muted"
          href={`/api/integrations/yelp/scan-emails?days=${YELP_SCAN_MAX_LOOKBACK_DAYS}`}
          target="_blank"
          rel="noreferrer"
          title={`Dry run: last ${YELP_SCAN_MAX_LOOKBACK_DAYS} days, up to ${YELP_SCAN_MAX_MESSAGES} messages, writes nothing`}
        >
          Preview last {YELP_SCAN_MAX_LOOKBACK_DAYS} days
        </a>
        <form
          action={`/api/integrations/yelp/scan-emails?days=${YELP_SCAN_MAX_LOOKBACK_DAYS}`}
          method="post"
        >
          <button className="btn btn-toolbar" type="submit" disabled={!mailbox.ready}>
            Import last {YELP_SCAN_MAX_LOOKBACK_DAYS} days
          </button>
        </form>
      </div>
      <p className="small text-body-secondary mt-2 mb-0">
        Routine import covers {YELP_SCAN_DEFAULT_LOOKBACK_DAYS} days (up to {YELP_SCAN_DEFAULT_MAX_MESSAGES}{' '}
        messages). The 180-day button is the backfill: it reads up to {YELP_SCAN_MAX_MESSAGES} Yelp messages and
        skips leads that already have a ticket (deduped on Yelp&apos;s conversation id). Re-running either import
        links the Gmail thread on tickets that do not have one yet and attaches follow-up Yelp emails to the
        existing ticket — you do not need to re-create Rose or the Stale pile. Add{' '}
        <code className="detail-mono">?max=</code> or <code className="detail-mono">?mailbox=</code> on the
        preview URL to override. Hard caps are <strong>{YELP_SCAN_MAX_LOOKBACK_DAYS} days</strong> and{' '}
        <strong>{YELP_SCAN_MAX_MESSAGES} messages</strong> so the scan finishes inside the serverless time budget —
        a truncated response means older Yelp mail was left unread.
      </p>
      <p className="small text-body-secondary mt-2 mb-0">
        Tickets link to the Yelp inbox, never to the one-click links in Yelp&apos;s email — those mark a lead as
        replied without a reply being sent.
      </p>
    </section>
  );
}
