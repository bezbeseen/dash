import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getQuickBooksEnvironment, QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';

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
  const implicitQbRedirect = `${req.nextUrl.origin}${QUICKBOOKS_OAUTH_CALLBACK_PATH}`;
  const redirectMatchesRequest =
    qbRedirectHost != null && qbRedirectHost === requestHost;

  const hints: string[] = [];
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
    'If Intuit/Google callbacks return 401 HTML, disable Vercel Deployment Protection or allow public access to /api/integrations/*.',
  );
  hints.push(
    'Register both Gmail and Google Business callback URLs on the same OAuth Web client if you use both.',
  );

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
    gmail: {
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
      hasExplicitRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI?.trim()),
    },
    googleBusinessProfile: {
      gbpCallbackPath: '/api/integrations/google-business/callback',
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
