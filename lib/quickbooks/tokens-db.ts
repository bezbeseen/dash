import { prisma } from '@/lib/db/prisma';
import { refreshQuickBooksAccessToken } from '@/lib/quickbooks/oauth';

const REFRESH_MARGIN_MS = 120_000;

export async function upsertQuickBooksTokens(params: {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds?: number;
}) {
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + params.expiresInSeconds * 1000);
  const refreshTokenExpiresAt =
    params.refreshExpiresInSeconds != null
      ? new Date(now + params.refreshExpiresInSeconds * 1000)
      : null;

  await prisma.quickBooksToken.upsert({
    where: { realmId: params.realmId },
    create: {
      realmId: params.realmId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
    update: {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
  });
}

/** Returns a valid Bearer token, refreshing if close to expiry. */
export async function getValidQuickBooksAccessToken(realmId: string): Promise<string> {
  const row = await prisma.quickBooksToken.findUnique({
    where: { realmId },
    select: {
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
    },
  });
  if (!row) {
    throw new Error(
      `No QuickBooks tokens for realm ${realmId}. Open /api/integrations/quickbooks/connect in the browser to connect.`
    );
  }

  if (row.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return row.accessToken;
  }

  const refreshed = await refreshQuickBooksAccessToken(row.refreshToken);

  await prisma.quickBooksToken.update({
    where: { realmId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      refreshTokenExpiresAt:
        refreshed.x_refresh_token_expires_in != null
          ? new Date(Date.now() + refreshed.x_refresh_token_expires_in * 1000)
          : row.refreshTokenExpiresAt,
    },
    select: { id: true },
  });

  return refreshed.access_token;
}
