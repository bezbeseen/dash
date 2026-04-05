import { prisma } from '@/lib/db/prisma';
import { requireGoogleOAuthClient } from '@/lib/gmail/config';

const REFRESH_MARGIN_MS = 120_000;

type TokenRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
};

async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google token refresh failed ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as TokenRefreshResponse;
  const access = json.access_token;
  if (!access) {
    throw new Error('Google token refresh: missing access_token');
  }
  const sec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const expiresAt = new Date(Date.now() + sec * 1000);
  return { accessToken: access, expiresAt };
}

export async function getValidGoogleBusinessAccessToken(googleEmail: string): Promise<string> {
  const row = await prisma.googleBusinessConnection.findUnique({
    where: { googleEmail },
    select: {
      refreshToken: true,
      accessToken: true,
      accessTokenExpiresAt: true,
    },
  });
  if (!row) {
    throw new Error(`No Google Business connection for ${googleEmail}`);
  }

  if (row.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return row.accessToken;
  }

  const { clientId, clientSecret } = requireGoogleOAuthClient();
  const { accessToken, expiresAt } = await refreshGoogleAccessToken(
    row.refreshToken,
    clientId,
    clientSecret,
  );

  await prisma.googleBusinessConnection.update({
    where: { googleEmail },
    data: {
      accessToken,
      accessTokenExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  return accessToken;
}
