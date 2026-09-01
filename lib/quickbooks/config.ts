/** OAuth callback path (no origin). Intuit must list the full URL: `{origin}{path}`. */
export const QUICKBOOKS_OAUTH_CALLBACK_PATH = '/api/integrations/quickbooks/callback';

export type QuickBooksEnvironment = 'sandbox' | 'production';

export function getQuickBooksEnvironment(): QuickBooksEnvironment {
  const v = (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox').toLowerCase();
  return v === 'production' ? 'production' : 'sandbox';
}

/** QBO v3 API base (no trailing slash). */
export function getQuickBooksApiBase(): string {
  return getQuickBooksEnvironment() === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

/** Max estimates + invoices pulled per manual sync (default 25 — keeps Vercel under timeout). */
export function getQuickBooksSyncMaxResults(): number {
  const raw = process.env.QUICKBOOKS_SYNC_MAX_RESULTS?.trim();
  if (!raw) return 25;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 25;
  return Math.min(n, 100);
}
