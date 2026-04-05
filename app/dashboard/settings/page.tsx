import Link from 'next/link';
import { GmailRedirectUriHint } from '@/components/gmail-redirect-uri-hint';
import { GmailSidebarHint } from '@/components/gmail-sidebar-hint';
import {
  gbpToastFromQuery,
  gmailToastFromQuery,
  qbToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import { GoogleBusinessSettingsSection } from '@/components/google-business-settings-section';
import { YelpApiSettingsSection } from '@/components/yelp-api-settings-section';

export const dynamic = 'force-dynamic';

type SettingsPageProps = {
  searchParams: Promise<{
    qb_connected?: string;
    qb_error?: string;
    qb_error_detail?: string;
    gmail_connected?: string;
    gmail_error?: string;
    gbp_connected?: string;
    gbp_error?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const q = await searchParams;
  const { connected: qbConnected, error: qbError } = qbToastFromQuery(q);
  const { connected: gmailConnected, error: gmailError } = gmailToastFromQuery(q);
  const { connected: gbpConnected, error: gbpError } = gbpToastFromQuery(q);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Settings</h1>
          <p className="board-topbar-sub">
            Connect QuickBooks, Gmail, Google Business Profile API, and optional Yelp Fusion. Ticket actions stay on the
            board.
          </p>
        </div>
      </header>

      {(gmailError ||
        qbError ||
        gbpError ||
        qbConnected ||
        gmailConnected ||
        gbpConnected) && (
        <div className="board-toasts" role="status">
          {gmailError ? <div className="board-toast board-toast-error">{gmailError}</div> : null}
          {qbError ? <div className="board-toast board-toast-error">{qbError}</div> : null}
          {gbpError ? <div className="board-toast board-toast-error">{gbpError}</div> : null}
          {qbConnected ? <div className="board-toast board-toast-ok">QuickBooks connected.</div> : null}
          {gmailConnected ? <div className="board-toast board-toast-ok">Gmail connected.</div> : null}
          {gbpConnected ? <div className="board-toast board-toast-ok">Google Business Profile connected.</div> : null}
        </div>
      )}

      <div className="settings-sections">
        <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
          <h2 className="h6 fw-semibold mb-3">QuickBooks</h2>
          <p className="small text-body-secondary mb-3">
            Connect your company, then sync estimates and invoices into{' '}
            <Link href="/dashboard/tickets">Tickets</Link>.
          </p>
          <div className="d-flex flex-wrap gap-2 align-items-center">
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
        </section>

        <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
          <h2 className="h6 fw-semibold mb-2">Gmail</h2>
          <p className="small text-body-secondary mb-3">
            Up to three mailboxes (e.g. you, partner, contact@). Used when syncing threads on tickets.
          </p>
          <GmailSidebarHint />
          <GmailRedirectUriHint />
        </section>

        <GoogleBusinessSettingsSection />

        <YelpApiSettingsSection />
      </div>
    </div>
  );
}
