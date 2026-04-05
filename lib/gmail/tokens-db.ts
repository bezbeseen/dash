import { google } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { requireGoogleOAuthCreds } from '@/lib/gmail/config';

const REFRESH_MARGIN_MS = 120_000;

async function buildClientForConnectionRow(conn: {
  id: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}) {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthCreds();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  oauth2.setCredentials({
    refresh_token: conn.refreshToken,
    access_token: conn.accessToken,
    expiry_date: conn.accessTokenExpiresAt.getTime(),
  });

  if (conn.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
    const { credentials } = await oauth2.refreshAccessToken();
    const at = credentials.access_token;
    const expMs = credentials.expiry_date ?? Date.now() + 3_600_000;
    if (!at) {
      throw new Error('Gmail token refresh failed. Reconnect that mailbox from Settings.');
    }
    await prisma.gmailConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: at,
        accessTokenExpiresAt: new Date(expMs),
        ...(credentials.refresh_token ? { refreshToken: credentials.refresh_token } : {}),
      },
    });
    oauth2.setCredentials({
      ...credentials,
      refresh_token: credentials.refresh_token ?? conn.refreshToken,
    });
  }

  return oauth2;
}

/** OAuth2 for a specific connected mailbox (you / partner / contact@). */
export async function getGmailOAuth2ClientForConnection(connectionId: string) {
  const conn = await prisma.gmailConnection.findUnique({ where: { id: connectionId } });
  if (!conn) {
    throw new Error('That Gmail account is not connected anymore. Choose another mailbox on the ticket.');
  }
  return buildClientForConnectionRow(conn);
}

/** Fallback: most recently updated connection (legacy / single-account). */
export async function getGmailOAuth2ClientForApi() {
  const conn = await prisma.gmailConnection.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!conn) {
    throw new Error('Gmail is not connected. Use Connect Gmail in Settings (up to 3 accounts).');
  }
  return buildClientForConnectionRow(conn);
}
