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

/** QuickBooks web app page for one estimate (opens the edit screen in the signed-in company). */
export function quickBooksEstimateAppUrl(estimateId: string): string {
  const host = getQuickBooksEnvironment() === 'production' ? 'https://qbo.intuit.com' : 'https://app.sandbox.qbo.intuit.com';
  return `${host}/app/estimate?txnId=${encodeURIComponent(estimateId)}`;
}

/** Deposit percent the shop asks for on estimates (default 50). The API cannot set it; Dash only reminds. */
export function getEstimateDepositPercent(): number {
  const raw = process.env.QUICKBOOKS_ESTIMATE_DEPOSIT_PERCENT?.trim().replace(/%$/, '');
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 50;
  return Math.round(n * 100) / 100;
}

export function estimateDepositReminderText(): string {
  return `Before sending: turn on Deposit request (${getEstimateDepositPercent()}%).`;
}

/** Max estimates + invoices pulled per manual sync (default 15 — fits Vercel Hobby ~10s limit). */
export function getQuickBooksSyncMaxResults(): number {
  const raw = process.env.QUICKBOOKS_SYNC_MAX_RESULTS?.trim();
  if (!raw) return 15;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 15;
  return Math.min(n, 50);
}
