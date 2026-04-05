import { google } from 'googleapis';
import { requireGoogleOAuthClient } from '@/lib/google-business/config';

const BUSINESS_MANAGE = 'https://www.googleapis.com/auth/business.manage';
/** Required so the access token can call oauth2/v2/userinfo (business.manage alone does not). */
const USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

export function buildGoogleBusinessAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [BUSINESS_MANAGE, USERINFO_EMAIL],
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
