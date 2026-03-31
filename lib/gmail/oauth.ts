import { google } from 'googleapis';
import { requireGoogleOAuthClient } from '@/lib/gmail/config';

const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

export function buildGmailAuthorizationUrl(state: string, redirectUri: string): string {
  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_READONLY],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string,
): Promise<{ tokens: import('google-auth-library').Credentials }> {
  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(code);
  return { tokens };
}
