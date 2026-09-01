import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { buildQuickBooksAuthorizationUrl } from '@/lib/quickbooks/oauth';
import { oauthRedirectHtmlPage } from '@/lib/http/oauth-redirect-html';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const qbOauthCookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 600,
  path: '/',
};

export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(24).toString('hex');
  const origin = new URL(req.url).origin;
  const envRedirect = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  const redirectUri = envRedirect || `${origin}${QUICKBOOKS_OAUTH_CALLBACK_PATH}`;

  let authUrl: string;
  try {
    authUrl = buildQuickBooksAuthorizationUrl(state, redirectUri);
  } catch {
    return NextResponse.redirect(new URL('/dashboard/settings?qb_error=config', origin));
  }

  // HTML + Set-Cookie beats a bare 302 when the browser soft-navigates to this route.
  const res = new NextResponse(oauthRedirectHtmlPage(authUrl, 'QuickBooks'), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
  res.cookies.set('qb_oauth_state', state, qbOauthCookieOpts);
  res.cookies.set('qb_oauth_redirect_uri', redirectUri, qbOauthCookieOpts);
  return res;
}
