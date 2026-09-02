export type IntuitTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
/** Last known-working production scope. Extra OpenID scopes did not fix App Center spinner. */
const QUICKBOOKS_OAUTH_SCOPES = 'com.intuit.quickbooks.accounting';

function stripWrappingQuotes(raw: string): string {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function trimEnv(key: 'QUICKBOOKS_CLIENT_ID' | 'QUICKBOOKS_CLIENT_SECRET'): string | undefined {
  const raw = process.env[key];
  if (raw == null) return undefined;
  const t = stripWrappingQuotes(raw);
  return t ? t : undefined;
}

/** Safe fingerprint for env-check (not secret — Intuit Client IDs are public in OAuth URLs). */
export function quickBooksClientIdFingerprint(): {
  length: number;
  preview: string | null;
  hadWrappingQuotes: boolean;
} {
  const raw = process.env.QUICKBOOKS_CLIENT_ID;
  if (raw == null || !raw.trim()) {
    return { length: 0, preview: null, hadWrappingQuotes: false };
  }
  const trimmed = raw.trim();
  const hadWrappingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  const id = stripWrappingQuotes(raw);
  if (!id) return { length: 0, preview: null, hadWrappingQuotes };
  const preview = id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : `${id.slice(0, 2)}…`;
  return { length: id.length, preview, hadWrappingQuotes };
}

/** True if missing or a common mistaken placeholder (e.g. literal "undefined" from bad env injection). */
function isInvalidClientCredentialValue(v: string | undefined): boolean {
  if (v == null) return true;
  const lower = v.toLowerCase();
  return (
    lower === 'undefined' ||
    lower === 'null' ||
    lower === 'replace-me' ||
    lower === 'replace_me' ||
    lower === 'your-client-id' ||
    lower === 'your-client-secret'
  );
}

/** Use in env-check / UI: real Intuit keys present (not empty or placeholder strings). */
export function quickBooksOAuthCredentialsConfigured(): boolean {
  const clientId = trimEnv('QUICKBOOKS_CLIENT_ID');
  const clientSecret = trimEnv('QUICKBOOKS_CLIENT_SECRET');
  return !isInvalidClientCredentialValue(clientId) && !isInvalidClientCredentialValue(clientSecret);
}

function requireClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = trimEnv('QUICKBOOKS_CLIENT_ID');
  const clientSecret = trimEnv('QUICKBOOKS_CLIENT_SECRET');
  if (isInvalidClientCredentialValue(clientId) || isInvalidClientCredentialValue(clientSecret)) {
    throw new Error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set');
  }
  return { clientId: clientId as string, clientSecret: clientSecret as string };
}

export function buildQuickBooksAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId } = requireClientCreds();
  if (!redirectUri.trim()) {
    throw new Error('QuickBooks redirect URI is empty');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: QUICKBOOKS_OAUTH_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<IntuitTokenResponse> {
  const { clientId, clientSecret } = requireClientCreds();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(8_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Intuit token endpoint error ${res.status}: ${text}`);
  }
  return JSON.parse(text) as IntuitTokenResponse;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<IntuitTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  return postToken(body);
}

export async function refreshQuickBooksAccessToken(
  refreshToken: string
): Promise<IntuitTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return postToken(body);
}
