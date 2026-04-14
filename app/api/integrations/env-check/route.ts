import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getQuickBooksEnvironment, QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';
import { GBP_OAUTH_CALLBACK_PATH } from '@/lib/google-business/config';

/**
 * Safe config snapshot (no secrets). For debugging OAuth on production.
 */
export async function GET(req: NextRequest) {
  const qbRedirect = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  let qbRedirectHost: string | null = null;
  if (qbRedirect) {
    try {
      qbRedirectHost = new URL(qbRedirect).host;
    } catch {
      qbRedirectHost = 'invalid_url';
    }
  }

  const requestHost = req.nextUrl.host;
  const origin = req.nextUrl.origin;
  const implicitQbRedirect = `${origin}${QUICKBOOKS_OAUTH_CALLBACK_PATH}`;
  const nextAuthUrlRaw = process.env.NEXTAUTH_URL?.trim() || '';
  let nextAuthHost: string | null = null;
  if (nextAuthUrlRaw) {
    try {
      nextAuthHost = new URL(nextAuthUrlRaw).host;
    } catch {
      nextAuthHost = 'invalid_url';
    }
  }
  const nextAuthCallback = `${origin}/api/auth/callback/google`;
  const gmailCallbackImplicit = `${origin}${GMAIL_OAUTH_CALLBACK_PATH}`;
  const gbpCallbackImplicit = `${origin}${GBP_OAUTH_CALLBACK_PATH}`;
  const explicitGmailRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  const gmailEffective =
    explicitGmailRedirect && explicitGmailRedirect.length > 0 ? explicitGmailRedirect : gmailCallbackImplicit;
  let gmailRedirectHost: string | null = null;
  try {
    gmailRedirectHost = new URL(gmailEffective).host;
  } catch {
    gmailRedirectHost = 'invalid_url';
  }
  const redirectMatchesRequest =
    qbRedirectHost != null && qbRedirectHost === requestHost;

  const hints: string[] = [];
  if (!process.env.NEXTAUTH_SECRET?.trim()) {
    hints.push(
      'NEXTAUTH_SECRET is not set — NextAuth will fail with NO_SECRET in production. In Vercel: Project → Settings → Environment Variables → add NEXTAUTH_SECRET for Production (generate: openssl rand -base64 32), then redeploy.',
    );
  }
  if (!qbRedirect) {
    hints.push(
      `QuickBooks redirect is not set in env; OAuth uses this request's origin + callback: ${implicitQbRedirect} (register that exact URL in Intuit).`,
    );
  } else if (!redirectMatchesRequest && qbRedirectHost) {
    hints.push(
      `QUICKBOOKS_REDIRECT_URI host is "${qbRedirectHost}" but you opened "${requestHost}". They must match (www vs non-www, preview vs production), or remove QUICKBOOKS_REDIRECT_URI to use the current host automatically.`,
    );
  }
  hints.push(
    'If Intuit/Google callbacks return 401 HTML, disable Vercel Deployment Protection or allow public access to /api/integrations/* and /api/auth/*.',
  );
  hints.push(
    'Google Cloud → APIs & Services → Credentials → your OAuth2.0 Web client → Authorized redirect URIs must list EVERY callback below (exact string, including https and path).',
  );
  if (nextAuthHost && nextAuthHost !== requestHost) {
    hints.push(
      `NEXTAUTH_URL host is "${nextAuthHost}" but this request is "${requestHost}". Set NEXTAUTH_URL to your real site URL (e.g. https://${requestHost}) or Google sign-in can fail.`,
    );
  }
  if (gmailRedirectHost && gmailRedirectHost !== requestHost) {
    hints.push(
      `GOOGLE_REDIRECT_URI host is "${gmailRedirectHost}" but you opened "${requestHost}". Remove GOOGLE_REDIRECT_URI on Vercel to use the current host, or set it to ${gmailCallbackImplicit}.`,
    );
  }
  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let nextPublicHost: string | null = null;
  if (nextPublic) {
    try {
      nextPublicHost = new URL(nextPublic).host;
    } catch {
      nextPublicHost = 'invalid_url';
    }
  }
  if (nextPublicHost && nextPublicHost !== requestHost) {
    hints.push(
      `NEXT_PUBLIC_APP_URL host "${nextPublicHost}" does not match "${requestHost}". Fix for correct Gmail/Slack links and optional redirect fallbacks.`,
    );
  }

  let gbpConnections = 0;
  try {
    gbpConnections = await prisma.googleBusinessConnection.count();
  } catch {
    gbpConnections = -1;
  }

  return NextResponse.json({
    requestHost,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? 'set'
      : 'missing',
    quickbooks: {
      hasClientId: Boolean(process.env.QUICKBOOKS_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.QUICKBOOKS_CLIENT_SECRET?.trim()),
      hasExplicitRedirectUri: Boolean(qbRedirect),
      effectiveOAuthCallback: qbRedirect || implicitQbRedirect,
      redirectHost: qbRedirectHost,
      redirectMatchesRequestHost: qbRedirect ? redirectMatchesRequest : true,
      environment: getQuickBooksEnvironment(),
    },
    google: {
      /** Paste each URI into Google Cloud → OAuth Web client → Authorized redirect URIs */
      authorizedRedirectUrisChecklist: [
        nextAuthCallback,
        gmailEffective,
        process.env.GOOGLE_REDIRECT_URI_GBP?.trim() || gbpCallbackImplicit,
      ],
      nextAuth: {
        secretSet: Boolean(process.env.NEXTAUTH_SECRET?.trim()),
        callbackPath: '/api/auth/callback/google',
        fullCallbackUrl: nextAuthCallback,
        nextAuthUrlSet: Boolean(nextAuthUrlRaw),
        nextAuthUrlHost: nextAuthHost,
        nextAuthUrlMatchesRequestHost:
          nextAuthHost == null ? null : nextAuthHost === requestHost,
      },
      gmail: {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
        hasExplicitRedirectUri: Boolean(explicitGmailRedirect),
        effectiveRedirectUrl: gmailEffective,
        effectiveRedirectHost: gmailRedirectHost,
        effectiveMatchesRequestHost: gmailRedirectHost === requestHost,
      },
    },
    googleBusinessProfile: {
      gbpCallbackPath: GBP_OAUTH_CALLBACK_PATH,
      fullCallbackUrl: process.env.GOOGLE_REDIRECT_URI_GBP?.trim() || gbpCallbackImplicit,
      hasExplicitGbpRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI_GBP?.trim()),
      storedConnections: gbpConnections,
      performanceApiLibrary:
        'https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com',
    },
    yelpFusion: {
      hasApiKey: Boolean(process.env.YELP_API_KEY?.trim()),
    },
    hints,
  });
}
