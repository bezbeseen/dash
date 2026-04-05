import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { GBP_OAUTH_CALLBACK_PATH, requireGoogleOAuthClient } from '@/lib/google-business/config';
import { buildGoogleBusinessAuthorizationUrl } from '@/lib/google-business/oauth';

const dashboardConfigError = () =>
  new URL('/dashboard/settings?gbp_error=config', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

export async function GET(req: NextRequest) {
  try {
    requireGoogleOAuthClient();
  } catch {
    return NextResponse.redirect(dashboardConfigError());
  }

  const state = crypto.randomBytes(24).toString('hex');
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  };

  cookieStore.set('gbp_oauth_state', state, cookieOpts);

  try {
    const origin = new URL(req.url).origin;
    const envRedirect = process.env.GOOGLE_REDIRECT_URI_GBP?.trim();
    const redirectUri = envRedirect || `${origin}${GBP_OAUTH_CALLBACK_PATH}`;
    cookieStore.set('gbp_oauth_redirect_uri', redirectUri, cookieOpts);

    const url = buildGoogleBusinessAuthorizationUrl(state, redirectUri);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(dashboardConfigError());
  }
}
