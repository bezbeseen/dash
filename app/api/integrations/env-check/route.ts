import { NextRequest, NextResponse } from 'next/server';
import { getQuickBooksEnvironment } from '@/lib/quickbooks/config';

/**
 * Safe config snapshot (no secrets). Use on production when OAuth "does nothing"
 * or callbacks fail — e.g. missing Vercel env, or Deployment Protection blocking callbacks.
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
  const redirectMatchesRequest =
    qbRedirectHost != null && qbRedirectHost === requestHost;

  return NextResponse.json({
    requestHost,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? 'set'
      : 'missing',
    quickbooks: {
      hasClientId: Boolean(process.env.QUICKBOOKS_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.QUICKBOOKS_CLIENT_SECRET?.trim()),
      hasRedirectUri: Boolean(qbRedirect),
      redirectHost: qbRedirectHost,
      redirectMatchesRequestHost: redirectMatchesRequest,
      environment: getQuickBooksEnvironment(),
    },
    gmail: {
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
      hasExplicitRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI?.trim()),
    },
    hints: [
      !redirectMatchesRequest &&
        qbRedirectHost &&
        `QUICKBOOKS_REDIRECT_URI host is "${qbRedirectHost}" but you opened "${requestHost}". They must match (www vs non-www, preview vs production).`,
      'If Intuit/Google hit your callback but you see 401 HTML, turn off Vercel **Deployment Protection** (or add a bypass) so /api/integrations/* is reachable without login.',
      'Open GET /api/integrations/gmail for exact connect + callback URLs for this host.',
    ].filter(Boolean),
  });
}
