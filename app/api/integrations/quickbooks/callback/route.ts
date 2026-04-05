import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorizationCode } from '@/lib/quickbooks/oauth';
import { upsertQuickBooksTokens } from '@/lib/quickbooks/tokens-db';

function dashboardOn(req: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/dashboard/settings?${query}`, req.nextUrl.origin));
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('qb_oauth_state')?.value;
  const state = req.nextUrl.searchParams.get('state');

  if (!expectedState || !state || state !== expectedState) {
    return dashboardOn(req, 'qb_error=state');
  }

  cookieStore.delete('qb_oauth_state');

  const oauthError = req.nextUrl.searchParams.get('error');
  if (oauthError) {
    const desc = req.nextUrl.searchParams.get('error_description');
    const q = new URLSearchParams({ qb_error: 'denied' });
    if (desc) q.set('qb_error_detail', desc.slice(0, 300));
    return dashboardOn(req, q.toString());
  }

  const code = req.nextUrl.searchParams.get('code');
  const realmId = req.nextUrl.searchParams.get('realmId');
  if (!code || !realmId) {
    return dashboardOn(req, 'qb_error=missing');
  }

  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!redirectUri) {
    return dashboardOn(req, 'qb_error=config');
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, redirectUri);
    await upsertQuickBooksTokens({
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      refreshExpiresInSeconds: tokens.x_refresh_token_expires_in,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Token exchange failed';
    const q = new URLSearchParams({
      qb_error: 'token',
      qb_error_detail: message.slice(0, 400),
    });
    return dashboardOn(req, q.toString());
  }

  return dashboardOn(req, 'qb_connected=1');
}
