import Link from 'next/link';
import { GmailRedirectUriHint } from '@/components/gmail-redirect-uri-hint';
import { GmailSidebarHint } from '@/components/gmail-sidebar-hint';
import {
  gbpToastFromQuery,
  gmailToastFromQuery,
  qbToastFromQuery,
  syncToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import { GoogleBusinessSettingsSection } from '@/components/google-business-settings-section';
import { YelpApiSettingsSection } from '@/components/yelp-api-settings-section';
import { QuickBooksConnectButton } from '@/components/quickbooks-connect-button';
import { QuickBooksSyncForm } from '@/components/quickbooks-sync-form';

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
    synced?: string;
    sync_error?: string;
    sync_warn?: string;
    e?: string;
    i?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const q = await searchParams;
  const { connected: qbConnected, error: qbError } = qbToastFromQuery(q);
  const { connected: gmailConnected, error: gmailError } = gmailToastFromQuery(q);
  const { connected: gbpConnected, error: gbpError } = gbpToastFromQuery(q);
  const { synced, syncError } = syncToastFromQuery(q);
  const syncWarnEmpty = q.sync_warn === 'empty';

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
        syncError ||
        synced ||
        syncWarnEmpty ||
        qbConnected ||
        gmailConnected ||
        gbpConnected) && (
        <div className="board-toasts" role="status">
          {syncError ? <div className="board-toast board-toast-error">QuickBooks sync error: {syncError}</div> : null}
          {synced ? (
            <div className="board-toast board-toast-ok">
              QuickBooks sync finished
              {q.e || q.i ? ` (${q.e ?? 0} estimates, ${q.i ?? 0} invoices).` : '.'}
            </div>
          ) : null}
          {syncWarnEmpty ? (
            <div className="board-toast board-toast-error mb-0">
              QuickBooks returned no recent estimates or invoices. Check you connected the right company.
            </div>
          ) : null}
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
            <Link href="/dashboard/tickets">Tickets</Link>. If Intuit says <strong>undefined didn&apos;t connect</strong>
            , your <code className="detail-mono">QUICKBOOKS_CLIENT_ID</code> on Vercel must match Intuit{' '}
            <strong>Production</strong> keys (developer.intuit.com → Keys &amp; credentials).
          </p>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <QuickBooksConnectButton className="btn btn-toolbar">Connect QuickBooks</QuickBooksConnectButton>
            <QuickBooksSyncForm returnTo="/dashboard/settings">Sync from QuickBooks</QuickBooksSyncForm>
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
            Up to three mailboxes (e.g. you, partner, contact@). Used when syncing threads on tickets. Connect also grants
            Google Drive access so the app can move linked job folders when you set{' '}
            <code className="small">GOOGLE_DRIVE_*_FOLDER_ID</code> in the server environment — reconnect here after
            enabling those variables so the new scope is on your refresh token.
          </p>
          <GmailSidebarHint />
          <GmailRedirectUriHint />
        </section>

        <GoogleBusinessSettingsSection />

        <YelpApiSettingsSection />

        <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
          <h2 className="h6 fw-semibold mb-2">Integration health check</h2>
          <p className="small text-body-secondary mb-3">
            Safe JSON snapshot of env + DB connection counts (no secrets). Use when sign-in works but QuickBooks, Gmail,
            webhooks, or Slack seem off.
          </p>
          <a className="btn btn-toolbar" href="/api/integrations/env-check" target="_blank" rel="noreferrer">
            Open env-check
          </a>
        </section>
      </div>
    </div>
  );
}
