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
            ? 'QuickBooks: set real QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Vercel (not the literal word "undefined" or "replace-me"). If Intuit said "undefined didn\'t connect", your Client ID env var is wrong or missing.'
            : q.qb_error === 'token'
              ? `QuickBooks token exchange failed.${detail ? ` ${detail}` : ''} Check Vercel env matches Intuit (sandbox vs production keys, redirect URI exact match).`
              : q.qb_error === 'manual_input'
                ? 'Paste both a numeric Realm ID (Company ID) and the full refresh token from the Intuit OAuth Playground.'
                : q.qb_error === 'manual_token'
                  ? `Intuit rejected that refresh token.${detail ? ` ${detail}` : ''} Generate a fresh one in the OAuth Playground (they expire), and make sure the Playground used the same Production app as QUICKBOOKS_CLIENT_ID.`
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

export function yelpScanToastFromQuery(q: {
  yelp_scan?: string;
  yelp_created?: string;
  yelp_matched?: string;
  yelp_scanned?: string;
  yelp_scan_error?: string;
}): { message: string | null; error: string | null } {
  const error = q.yelp_scan_error?.trim()
    ? `Yelp email scan failed: ${q.yelp_scan_error.trim()}`
    : null;
  if (q.yelp_scan !== '1') {
    return { message: null, error };
  }
  const created = Number.parseInt(q.yelp_created ?? '0', 10) || 0;
  const matched = Number.parseInt(q.yelp_matched ?? '0', 10) || 0;
  const scanned = Number.parseInt(q.yelp_scanned ?? '0', 10) || 0;
  const message =
    created > 0
      ? `Yelp: created ${created} pre-quote ticket${created === 1 ? '' : 's'} from ${matched} lead email${matched === 1 ? '' : 's'}.`
      : matched > 0
        ? `Yelp: found ${matched} lead email${matched === 1 ? '' : 's'}, all already imported.`
        : `Yelp: no lead emails found in the ${scanned} Yelp message${scanned === 1 ? '' : 's'} scanned.`;
  return { message, error };
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
  if (q.job_error === 'restore') {
    return 'Could not restore that ticket - it may already be on the board.';
  }
  if (q.job_error === 'paid') {
    return 'Paid is set from QuickBooks — sync after payment instead of dragging there.';
  }
  return null;
}
