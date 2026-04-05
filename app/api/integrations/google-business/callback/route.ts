import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { GBP_OAUTH_CALLBACK_PATH, requireGoogleOAuthClient } from '@/lib/google-business/config';
import { exchangeGoogleBusinessCode } from '@/lib/google-business/oauth';

const MAX_GBP_CONNECTIONS = 3;

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('gbp_oauth_state')?.value;
  const state = req.nextUrl.searchParams.get('state');

  if (!expectedState || !state || state !== expectedState) {
    const callback = `${req.nextUrl.origin}${GBP_OAUTH_CALLBACK_PATH}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Google Business OAuth</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1>Cannot complete Google Business sign-in</h1>
<p>Start again from <strong>Settings</strong> &rarr; <strong>Connect Google Business Profile</strong>.</p>
<p>Authorized redirect URI must match exactly:</p>
<p style="word-break:break-all;background:#f4f4f5;padding:0.75rem;border-radius:8px;font-family:ui-monospace,monospace">${callback}</p>
<p><a href="/dashboard/settings">&larr; Back to Settings</a></p>
</body></html>`;
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  cookieStore.delete('gbp_oauth_state');

  const redirectFromCookie = cookieStore.get('gbp_oauth_redirect_uri')?.value;
  cookieStore.delete('gbp_oauth_redirect_uri');
  const redirectUri =
    redirectFromCookie ||
    process.env.GOOGLE_REDIRECT_URI_GBP?.trim() ||
    `${req.nextUrl.origin}${GBP_OAUTH_CALLBACK_PATH}`;

  if (req.nextUrl.searchParams.get('error')) {
    return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=denied', req.nextUrl.origin));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=no_code', req.nextUrl.origin));
  }

  try {
    const { tokens } = await exchangeGoogleBusinessCode(code, redirectUri);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=no_refresh', req.nextUrl.origin));
    }

    requireGoogleOAuthClient();
    const access = tokens.access_token;
    if (!access) {
      return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=no_access', req.nextUrl.origin));
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=no_profile', req.nextUrl.origin));
    }
    const profile = (await profileRes.json()) as { email?: string };
    const email = profile.email?.trim();
    if (!email) {
      return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=no_email', req.nextUrl.origin));
    }

    const exp = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3_600_000);

    const existingConn = await prisma.googleBusinessConnection.findUnique({ where: { googleEmail: email } });
    const count = await prisma.googleBusinessConnection.count();
    if (!existingConn && count >= MAX_GBP_CONNECTIONS) {
      return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=max_connections', req.nextUrl.origin));
    }

    await prisma.googleBusinessConnection.upsert({
      where: { googleEmail: email },
      create: {
        googleEmail: email,
        refreshToken: tokens.refresh_token,
        accessToken: access,
        accessTokenExpiresAt: exp,
      },
      update: {
        refreshToken: tokens.refresh_token,
        accessToken: access,
        accessTokenExpiresAt: exp,
      },
    });

    return NextResponse.redirect(new URL('/dashboard/settings?gbp_connected=1', req.nextUrl.origin));
  } catch (e) {
    console.error('[gbp/callback]', e);
    return NextResponse.redirect(new URL('/dashboard/settings?gbp_error=token', req.nextUrl.origin));
  }
}
