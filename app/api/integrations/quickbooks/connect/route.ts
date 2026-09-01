import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { buildQuickBooksAuthorizationUrl } from '@/lib/quickbooks/oauth';

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

  // Full-page navigation (Connect button uses location.assign) — 302 is reliable here.
  const res = NextResponse.redirect(authUrl);
  res.cookies.set('qb_oauth_state', state, qbOauthCookieOpts);
  res.cookies.set('qb_oauth_redirect_uri', redirectUri, qbOauthCookieOpts);
  return res;
}
