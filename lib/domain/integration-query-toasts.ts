/** Shared parsing for URL query toast messages (OAuth + integrations). */

export function qbToastFromQuery(q: {
  qb_connected?: string;
  qb_error?: string;
  qb_error_detail?: string;
}): { connected: boolean; error: string | null } {
  const connected = q.qb_connected === '1';
  const detail = q.qb_error_detail?.trim() || null;
  const error =
    q.qb_error === 'state'
      ? 'QuickBooks: sign-in expired or cookies were blocked. Use one browser, finish on the same tab, and click Connect QuickBooks again from this site.'
      : q.qb_error === 'denied'
        ? `QuickBooks sign-in was cancelled or denied.${detail ? ` (${detail})` : ''}`
        : q.qb_error === 'missing'
          ? 'QuickBooks returned an incomplete response. Try Connect QuickBooks again.'
          : q.qb_error === 'config'
            ? 'QuickBooks: missing CLIENT_ID, CLIENT_SECRET, or QUICKBOOKS_REDIRECT_URI on the server (check Vercel env).'
            : q.qb_error === 'token'
              ? `QuickBooks token exchange failed.${detail ? ` ${detail}` : ''} Check Vercel env matches Intuit (sandbox vs production keys, redirect URI exact match).`
              : null;
  return { connected, error };
}

export function gmailToastFromQuery(q: {
  gmail_connected?: string;
  gmail_error?: string;
}): { connected: boolean; error: string | null } {
  const connected = q.gmail_connected === '1';
  const error =
    q.gmail_error === 'config'
      ? 'Gmail: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env (REDIRECT_URI is optional - see README)'
      : q.gmail_error === 'denied'
        ? 'Gmail sign-in was cancelled.'
        : q.gmail_error === 'no_refresh'
          ? 'Gmail did not return a refresh token. Disconnect the app in Google Account > Security and try Connect again.'
          : q.gmail_error === 'no_profile'
            ? 'Could not read Gmail profile after connect.'
            : q.gmail_error === 'gmail_api'
              ? 'Gmail API blocked this account (403). In the same Google Cloud project as your OAuth client: APIs and Services > Library > enable Gmail API > Save. Wait a few minutes, then Connect Gmail again.'
              : q.gmail_error === 'gmail_profile'
                ? 'Gmail could not load your mailbox profile after sign-in. Try again; if it persists, enable Gmail API on the project and add yourself as a test user on the OAuth consent screen.'
                : q.gmail_error === 'token'
                  ? 'Gmail token exchange failed - check .env client ID/secret and that the redirect URI in Google Cloud matches this app.'
                  : q.gmail_error === 'no_code'
                    ? 'Gmail OAuth missing code.'
                    : q.gmail_error === 'max_mailboxes'
                      ? 'Gmail: max 3 mailboxes. Connect only new addresses from Settings, or delete a GmailConnection row in Prisma Studio to free a slot.'
                      : null;
  return { connected, error };
}

export function gbpToastFromQuery(q: {
  gbp_connected?: string;
  gbp_error?: string;
}): { connected: boolean; error: string | null } {
  const connected = q.gbp_connected === '1';
  const error =
    q.gbp_error === 'config'
      ? 'Google Business: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (same as Gmail).'
      : q.gbp_error === 'denied'
        ? 'Google Business sign-in was cancelled.'
        : q.gbp_error === 'no_refresh'
          ? 'Google did not return a refresh token. Remove app access in Google Account security and try Connect again with prompt=consent.'
          : q.gbp_error === 'no_code'
            ? 'Google Business OAuth missing code.'
            : q.gbp_error === 'no_access'
              ? 'Google Business: no access token returned.'
              : q.gbp_error === 'no_profile'
                ? 'Could not load Google profile after connect.'
                : q.gbp_error === 'no_email'
                  ? 'Google profile had no email.'
                  : q.gbp_error === 'max_connections'
                    ? 'Google Business: max 3 connected accounts.'
                    : q.gbp_error === 'token'
                      ? 'Google Business token exchange failed - check redirect URI matches Google Cloud (path /api/integrations/google-business/callback).'
                      : null;
  return { connected, error };
}

export function syncToastFromQuery(q: { synced?: string; sync_error?: string }): {
  synced: boolean;
  syncError: string | null;
} {
  return {
    synced: q.synced === '1',
    syncError: q.sync_error ? decodeURIComponent(q.sync_error) : null,
  };
}

export function jobErrorFromQuery(q: { job_error?: string }): string | null {
  if (q.job_error === 'blocked') {
    return "That action isn't available for this ticket (e.g. it's off the board).";
  }
  if (q.job_error === 'archive') {
    return 'Could not remove that ticket - it may already be off the board.';
  }
  return null;
}
