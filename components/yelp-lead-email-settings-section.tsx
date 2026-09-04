import { prisma } from '@/lib/db/prisma';
import { YELP_SCAN_DEFAULT_LOOKBACK_DAYS } from '@/lib/gmail/scan-yelp-lead-emails';
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
        Requested ticket, deduped so re-scanning is safe.
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
          title="Dry run: shows what Dash would import, writes nothing"
        >
          Preview matches
        </a>
        <form action="/api/integrations/yelp/scan-emails" method="post">
          <button className="btn btn-toolbar" type="submit" disabled={!mailbox.ready}>
            Import Yelp leads
          </button>
        </form>
      </div>
      <p className="small text-body-secondary mt-2 mb-0">
        Scans the last {YELP_SCAN_DEFAULT_LOOKBACK_DAYS} days. Add{' '}
        <code className="detail-mono">?days=60&amp;max=50</code> to the preview URL to look further back, or{' '}
        <code className="detail-mono">?mailbox=</code> to try another connected address.
      </p>
    </section>
  );
}
