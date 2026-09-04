import { google } from 'googleapis';
import { requireGoogleOAuthClient } from '@/lib/google-business/config';

/** Covers account listing, business information, and the Performance API. */
export const GBP_BUSINESS_MANAGE_SCOPE = 'https://www.googleapis.com/auth/business.manage';
/** Required so the access token can call oauth2/v2/userinfo (business.manage alone does not). */
const USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

export function buildGoogleBusinessAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GBP_BUSINESS_MANAGE_SCOPE, USERINFO_EMAIL],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeGoogleBusinessCode(
  code: string,
  redirectUri: string,
): Promise<{ tokens: import('google-auth-library').Credentials }> {
  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(code);
  return { tokens };
}

/**
 * Scopes a stored token actually carries. Dash does not persist the granted scope list, so this is
 * the only way to tell an old narrow consent apart from a disabled API.
 */
export async function fetchGrantedScopes(accessToken: string): Promise<string[]> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) {
    throw new Error(`Google tokeninfo ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as { scope?: string };
  return body.scope?.split(/\s+/).filter(Boolean) ?? [];
}
