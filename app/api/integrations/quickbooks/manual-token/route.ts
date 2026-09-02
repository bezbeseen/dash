import { NextRequest, NextResponse } from 'next/server';
import { refreshQuickBooksAccessToken } from '@/lib/quickbooks/oauth';
import { upsertQuickBooksTokens } from '@/lib/quickbooks/tokens-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fallback connect for when Intuit App Center hangs on the consent page.
 *
 * Paste a Realm ID + Refresh Token from the Intuit OAuth 2.0 Playground; we trade the
 * refresh token for a live access token (proving the credentials work) and store both.
 * Session-protected by middleware, same as the rest of /api.
 */
export async function POST(req: NextRequest) {
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?${query}`, req.nextUrl.origin), 303);

  let realmId = '';
  let refreshToken = '';
  try {
    const form = await req.formData();
    realmId = String(form.get('realm_id') ?? '').trim();
    refreshToken = String(form.get('refresh_token') ?? '').trim();
  } catch {
    return settings('qb_error=manual_input');
  }

  if (!/^\d{5,}$/.test(realmId) || refreshToken.length < 20) {
    return settings('qb_error=manual_input');
  }

  try {
    const tokens = await refreshQuickBooksAccessToken(refreshToken);
    await upsertQuickBooksTokens({
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      refreshExpiresInSeconds: tokens.x_refresh_token_expires_in,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Token refresh failed';
    const q = new URLSearchParams({ qb_error: 'manual_token', qb_error_detail: message.slice(0, 400) });
    return settings(q.toString());
  }

  return settings('qb_connected=1');
}
