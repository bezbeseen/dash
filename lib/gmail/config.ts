/** Path only — combined with request origin when `GOOGLE_REDIRECT_URI` is omitted. */
export const GMAIL_OAUTH_CALLBACK_PATH = '/api/integrations/gmail/callback';

export function requireGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env for Gmail sync.');
  }
  return { clientId, clientSecret };
}

/**
 * Redirect URI used when refreshing tokens (OAuth2 client construction).
 * Should match one of the URIs in Google Cloud → Credentials for this client.
 */
export function getGoogleOAuthRedirectUriFallback(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').trim().replace(/\/$/, '');
  return `${base}${GMAIL_OAUTH_CALLBACK_PATH}`;
}

/** @deprecated use requireGoogleOAuthClient + explicit redirect from cookie/request for auth code flow */
export function requireGoogleOAuthCreds() {
  return { ...requireGoogleOAuthClient(), redirectUri: getGoogleOAuthRedirectUriFallback() };
}
