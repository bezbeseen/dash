import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorizationCode } from '@/lib/quickbooks/oauth';
import { upsertQuickBooksTokens } from '@/lib/quickbooks/tokens-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dashboardOn(req: NextRequest, query: string) {
  const res = NextResponse.redirect(
    new URL(`/dashboard/settings?${query}`, req.nextUrl.origin),
  );
  res.cookies.delete('qb_oauth_state');
  res.cookies.delete('qb_oauth_redirect_uri');
  return res;
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get('qb_oauth_state')?.value;
  const state = req.nextUrl.searchParams.get('state');

  if (!expectedState || !state || state !== expectedState) {
    return dashboardOn(req, 'qb_error=state');
  }

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

  const redirectFromCookie = req.cookies.get('qb_oauth_redirect_uri')?.value;
  const redirectUri = redirectFromCookie || process.env.QUICKBOOKS_REDIRECT_URI?.trim();
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
