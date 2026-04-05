import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { buildGmailAuthorizationUrl } from '@/lib/gmail/oauth';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';

const dashboardConfigError = () =>
  new URL('/dashboard/settings?gmail_error=config', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

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

  cookieStore.set('gmail_oauth_state', state, cookieOpts);

  try {
    const origin = new URL(req.url).origin;
    const envRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
    // If .env omits redirect, use the host you actually opened (fixes localhost vs 127.0.0.1 mismatch).
    const redirectUri = envRedirect || `${origin}${GMAIL_OAUTH_CALLBACK_PATH}`;
    cookieStore.set('gmail_oauth_redirect_uri', redirectUri, cookieOpts);

    const url = buildGmailAuthorizationUrl(state, redirectUri);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(dashboardConfigError());
  }
}
