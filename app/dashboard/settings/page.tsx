import Link from 'next/link';
import { GmailRedirectUriHint } from '@/components/gmail-redirect-uri-hint';
import { GmailSidebarHint } from '@/components/gmail-sidebar-hint';
import {
  gbpToastFromQuery,
  gmailToastFromQuery,
  qbToastFromQuery,
  syncToastFromQuery,
  threadMatchToastFromQuery,
  yelpScanToastFromQuery,
} from '@/lib/domain/integration-query-toasts';
import { GmailThreadMatchSettingsSection } from '@/components/gmail-thread-match-settings-section';
import { GoogleBusinessSettingsSection } from '@/components/google-business-settings-section';
import { YelpApiSettingsSection } from '@/components/yelp-api-settings-section';
import { YelpLeadEmailSettingsSection } from '@/components/yelp-lead-email-settings-section';
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
    yelp_scan?: string;
    yelp_created?: string;
    yelp_matched?: string;
    yelp_scanned?: string;
    yelp_scan_error?: string;
    thread_match?: string;
    thread_linked?: string;
    thread_suggested?: string;
    thread_scanned?: string;
    thread_resync?: string;
    thread_resynced?: string;
    thread_resync_failed?: string;
    thread_match_error?: string;
    e?: string;
    i?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const q = await searchParams;
  const appOrigin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const qbRedirectExample = appOrigin
    ? `${appOrigin}/api/integrations/quickbooks/callback`
    : '/api/integrations/quickbooks/callback';
  const { connected: qbConnected, error: qbError } = qbToastFromQuery(q);
  const { connected: gmailConnected, error: gmailError } = gmailToastFromQuery(q);
  const { connected: gbpConnected, error: gbpError } = gbpToastFromQuery(q);
  const { synced, syncError } = syncToastFromQuery(q);
  const { message: yelpScanMessage, error: yelpScanError } = yelpScanToastFromQuery(q);
  const { message: threadMatchMessage, error: threadMatchError } = threadMatchToastFromQuery(q);
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
        gbpConnected ||
        yelpScanMessage ||
        yelpScanError ||
        threadMatchMessage ||
        threadMatchError) && (
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
          {yelpScanError ? <div className="board-toast board-toast-error">{yelpScanError}</div> : null}
          {yelpScanMessage ? <div className="board-toast board-toast-ok">{yelpScanMessage}</div> : null}
          {threadMatchError ? <div className="board-toast board-toast-error">{threadMatchError}</div> : null}
          {threadMatchMessage ? <div className="board-toast board-toast-ok">{threadMatchMessage}</div> : null}
        </div>
      )}

      <div className="settings-sections">
        <section className="settings-section card border rounded-3 p-4 mb-3 bg-body">
          <h2 className="h6 fw-semibold mb-3">QuickBooks</h2>
          <p className="small text-body-secondary mb-3">
            Connect your company, then sync estimates and invoices into{' '}
            <Link href="/dashboard/tickets">Tickets</Link>. If Intuit says <strong>undefined didn&apos;t connect</strong>
            , your <code className="detail-mono">QUICKBOOKS_CLIENT_ID</code> on Vercel must match Intuit{' '}
            <strong>Production</strong> keys (developer.intuit.com → Keys &amp; credentials). In the same app,
            add redirect URI{' '}
            <code className="detail-mono" style={{ wordBreak: 'break-all' }}>
              {qbRedirectExample}
            </code>{' '}
            (Intuit Developer → your app → Settings → Redirect URIs — not Google Cloud). If the tab spins on a
            blue-dot Intuit page, try a private window or{' '}
            <a href="/api/integrations/quickbooks/connect" target="_blank" rel="noreferrer">
              open connect in a new tab
            </a>
            .
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

          <details className="mt-3">
            <summary className="small text-body-secondary" style={{ cursor: 'pointer' }}>
              Intuit consent page stuck on spinning dots? Connect manually
            </summary>
            <div className="small text-body-secondary mt-2">
              <p className="mb-2">
                When Intuit&apos;s App Center hangs, get tokens from the{' '}
                <a
                  href="https://developer.intuit.com/app/developer/playground"
                  target="_blank"
                  rel="noreferrer"
                >
                  OAuth 2.0 Playground
                </a>{' '}
                instead: pick this app, choose <strong>Production</strong>, scope{' '}
                <code className="detail-mono">com.intuit.quickbooks.accounting</code>, authorize your company, then copy
                the <strong>Realm ID</strong> and <strong>Refresh Token</strong> here. Refresh tokens expire, so paste a
                fresh one.
              </p>
              <form action="/api/integrations/quickbooks/manual-token" method="post" className="d-flex flex-column gap-2">
                <input
                  className="form-control form-control-sm"
                  name="realm_id"
                  placeholder="Realm ID (Company ID), e.g. 9130353116719726"
                  inputMode="numeric"
                  required
                />
                <input
                  className="form-control form-control-sm"
                  name="refresh_token"
                  placeholder="Refresh token from the OAuth Playground"
                  required
                />
                <div>
                  <button className="btn btn-toolbar" type="submit">
                    Save QuickBooks tokens
                  </button>
                </div>
              </form>
            </div>
          </details>
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

        <GmailThreadMatchSettingsSection />

        <GoogleBusinessSettingsSection />

        <YelpLeadEmailSettingsSection />

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
