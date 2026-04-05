import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireGoogleOAuthClient, GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';
import { googleApiFirstReason, googleApiStatus } from '@/lib/gmail/google-api-error';
import { exchangeGmailCode } from '@/lib/gmail/oauth';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('gmail_oauth_state')?.value;
  const state = req.nextUrl.searchParams.get('state');

  if (!expectedState || !state || state !== expectedState) {
    const callback = `${req.nextUrl.origin}${GMAIL_OAUTH_CALLBACK_PATH}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Gmail OAuth</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1>Can’t complete Gmail sign-in from this link</h1>
<p>This usually means the tab sat open too long, you used a different browser, or you opened this URL manually. <strong>Start again from Dash:</strong> <strong>Settings</strong> → <strong>Connect Gmail</strong>.</p>
<p>If Google says the page or redirect doesn’t exist, the redirect URI in <strong>Google Cloud → Credentials → your Web client → Authorized redirect URIs</strong> must match <em>exactly</em>:</p>
<p style="word-break:break-all;background:#f4f4f5;padding:0.75rem;border-radius:8px;font-family:ui-monospace,monospace">${callback}</p>
<p><small>Note the path includes <code>/api/integrations/gmail/callback</code> — not <code>/gmail/callback</code> alone.</small></p>
<p><a href="/dashboard/settings">← Back to Settings</a></p>
</body></html>`;
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  cookieStore.delete('gmail_oauth_state');

  const redirectFromCookie = cookieStore.get('gmail_oauth_redirect_uri')?.value;
  cookieStore.delete('gmail_oauth_redirect_uri');
  const redirectUri =
    redirectFromCookie ||
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${req.nextUrl.origin}${GMAIL_OAUTH_CALLBACK_PATH}`;

  if (req.nextUrl.searchParams.get('error')) {
    return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=denied', req.nextUrl.origin));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=no_code', req.nextUrl.origin));
  }

  try {
    const { tokens } = await exchangeGmailCode(code, redirectUri);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=no_refresh', req.nextUrl.origin));
    }

    const { clientId, clientSecret } = requireGoogleOAuthClient();
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    let email: string | undefined;
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      email = profile.data.emailAddress ?? undefined;
    } catch (profileErr) {
      const status = googleApiStatus(profileErr);
      const reason = googleApiFirstReason(profileErr);
      console.error('[gmail/callback] users.getProfile failed:', profileErr);
      if (status === 403 || reason === 'accessNotConfigured') {
        return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=gmail_api', req.nextUrl.origin));
      }
      return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=gmail_profile', req.nextUrl.origin));
    }

    if (!email) {
      return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=no_profile', req.nextUrl.origin));
    }

    const exp = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3_600_000);

    const existingConn = await prisma.gmailConnection.findUnique({ where: { googleEmail: email } });
    const mailboxCount = await prisma.gmailConnection.count();
    if (!existingConn && mailboxCount >= 3) {
      return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=max_mailboxes', req.nextUrl.origin));
    }

    await prisma.gmailConnection.upsert({
      where: { googleEmail: email },
      create: {
        googleEmail: email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token!,
        accessTokenExpiresAt: exp,
      },
      update: {
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token!,
        accessTokenExpiresAt: exp,
      },
    });

    return NextResponse.redirect(new URL('/dashboard/settings?gmail_connected=1', req.nextUrl.origin));
  } catch (e) {
    console.error('[gmail/callback] token exchange failed:', e);
    return NextResponse.redirect(new URL('/dashboard/settings?gmail_error=token', req.nextUrl.origin));
  }
}
