import { google } from 'googleapis';

const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type Ga4ServiceAccount = { clientEmail: string; privateKey: string };

/**
 * Numeric GA4 property ID (Admin → Property settings), not the `G-XXXXXXXX` measurement ID
 * used by the browser tag.
 */
export function getGa4PropertyId(): string | null {
  const raw = process.env.GA4_PROPERTY_ID?.trim().replace(/^properties\//, '');
  if (!raw || !/^\d+$/.test(raw)) return null;
  return raw;
}

/** Accepts raw JSON or base64 of the key file, since multiline JSON is awkward in Vercel. */
function parseServiceAccount(raw: string): Ga4ServiceAccount | null {
  let text = raw.trim();
  if (!text) return null;
  if (!text.startsWith('{')) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const o = parsed as Record<string, unknown>;
  const clientEmail = typeof o.client_email === 'string' ? o.client_email.trim() : '';
  // Env vars often arrive with literal \n instead of real newlines.
  const privateKey = typeof o.private_key === 'string' ? o.private_key.replace(/\\n/g, '\n') : '';
  if (!clientEmail || !privateKey.includes('PRIVATE KEY')) return null;

  return { clientEmail, privateKey };
}

export function getGa4ServiceAccount(): Ga4ServiceAccount | null {
  const raw = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON;
  return raw ? parseServiceAccount(raw) : null;
}

/** Safe for env-check and setup hints: this address must be granted Viewer on the GA4 property. */
export function getGa4ServiceAccountEmail(): string | null {
  return getGa4ServiceAccount()?.clientEmail ?? null;
}

export function ga4ReportingConfigured(): boolean {
  return Boolean(getGa4PropertyId() && getGa4ServiceAccount());
}

export async function getGa4AccessToken(): Promise<string> {
  const sa = getGa4ServiceAccount();
  if (!sa) {
    throw new Error(
      'GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON is missing or not a valid service account key (needs client_email and private_key).',
    );
  }

  const jwt = new google.auth.JWT({
    email: sa.clientEmail,
    key: sa.privateKey,
    scopes: [GA4_READONLY_SCOPE],
  });

  const { token } = await jwt.getAccessToken();
  if (!token) {
    throw new Error('Google did not return an access token for the analytics service account.');
  }
  return token;
}
