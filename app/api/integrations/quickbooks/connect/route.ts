import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { buildQuickBooksAuthorizationUrl } from '@/lib/quickbooks/oauth';

export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(24).toString('hex');
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  };

  cookieStore.set('qb_oauth_state', state, cookieOpts);

  try {
    const origin = new URL(req.url).origin;
    const envRedirect = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
    // If .env omits redirect, use the host you actually opened (localhost vs production).
    const redirectUri = envRedirect || `${origin}${QUICKBOOKS_OAUTH_CALLBACK_PATH}`;
    cookieStore.set('qb_oauth_redirect_uri', redirectUri, cookieOpts);

    const url = buildQuickBooksAuthorizationUrl(state, redirectUri);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/settings?qb_error=config', req.nextUrl.origin),
    );
  }
}
