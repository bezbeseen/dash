import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getQuickBooksEnvironment, QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { quickBooksOAuthCredentialsConfigured } from '@/lib/quickbooks/oauth';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';
import { GBP_OAUTH_CALLBACK_PATH } from '@/lib/google-business/config';
import {
  getReviewRequestSendAsEmail,
  reviewRequestEmailAttachInvoicePdfEnabled,
  reviewRequestEmailFeatureEnabled,
  reviewRequestGmailMailboxConnected,
} from '@/lib/email/review-request-after-done';

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
  const nextAuthCallbackFromRequest = `${origin}/api/auth/callback/google`;
  const nextAuthCallbackEffective = nextAuthUrlRaw
    ? `${nextAuthUrlRaw.replace(/\/+$/, '')}/api/auth/callback/google`
    : nextAuthCallbackFromRequest;
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

  let quickBooksExplicitRedirectPathOk: boolean | null = null;
  if (qbRedirect) {
    try {
      const p = new URL(qbRedirect).pathname.replace(/\/$/, '') || '/';
      const expected = QUICKBOOKS_OAUTH_CALLBACK_PATH.replace(/\/$/, '');
      quickBooksExplicitRedirectPathOk = p === expected;
    } catch {
      quickBooksExplicitRedirectPathOk = false;
    }
  }

  const dbUrlRaw = process.env.DATABASE_URL?.trim();
  let databaseHostname: string | null = null;
  let databaseHostLooksLocal = false;
  if (dbUrlRaw) {
    try {
      databaseHostname = new URL(dbUrlRaw).hostname;
      databaseHostLooksLocal =
        databaseHostname === 'localhost' ||
        databaseHostname === '127.0.0.1' ||
        databaseHostname === '::1';
    } catch {
      databaseHostname = 'invalid_url';
    }
  }

  const hints: string[] = [];
  if (!dbUrlRaw) {
    hints.push(
      'DATABASE_URL is not set. Without PostgreSQL, /dashboard and other pages throw at runtime. Add DATABASE_URL (and DIRECT_URL if you use migrations) in Vercel → Environment Variables, then redeploy.',
    );
  } else if (process.env.VERCEL === '1' && databaseHostLooksLocal) {
    hints.push(
      'DATABASE_URL points at localhost; Vercel cannot reach your laptop. Use a hosted Postgres URL (Neon, Supabase, Vercel Postgres, RDS, …), run `npx prisma migrate deploy` against that database, set the URL in Vercel, redeploy.',
    );
  }
  if (!quickBooksOAuthCredentialsConfigured()) {
    hints.push(
      'QuickBooks OAuth: QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET are missing or look like placeholders (e.g. literal "undefined"). Intuit will show "undefined didn\'t connect". Set real keys from developer.intuit.com → your app → Keys & credentials.',
    );
  }
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
  if (qbRedirect && quickBooksExplicitRedirectPathOk === false) {
    hints.push(
      `QUICKBOOKS_REDIRECT_URI must be the QuickBooks callback only: …${QUICKBOOKS_OAUTH_CALLBACK_PATH} (register the same URL in Intuit). Yours points at a different path — often Gmail was pasted by mistake. Fix or delete QUICKBOOKS_REDIRECT_URI to use ${implicitQbRedirect}.`,
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
      `NEXTAUTH_URL host is "${nextAuthHost}" but this request is "${requestHost}". Google sign-in sends redirect_uri ${nextAuthCallbackEffective} — register that exact URL in Google Cloud, or set NEXTAUTH_URL to https://${requestHost} and redeploy.`,
    );
  }
  if (nextAuthUrlRaw && nextAuthCallbackEffective !== nextAuthCallbackFromRequest) {
    hints.push(
      `Sign-in redirect_uri (${nextAuthCallbackEffective}) differs from this host's callback (${nextAuthCallbackFromRequest}). That is normal when NEXTAUTH_URL is set; Google must allow the NEXTAUTH_URL callback, not only the host you opened.`,
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
    if (dbUrlRaw) {
      hints.push(
        'Prisma could not reach the database (sample query failed). Confirm DATABASE_URL on this deployment, TLS (`?sslmode=require` if required), and that the DB allows connections from Vercel.',
      );
    }
  }

  let reviewGmailReady = false;
  try {
    reviewGmailReady = await reviewRequestGmailMailboxConnected();
  } catch {
    reviewGmailReady = false;
  }

  let gmailConnectionCount = -1;
  let quickBooksConnectionCount = -1;
  try {
    gmailConnectionCount = await prisma.gmailConnection.count();
    quickBooksConnectionCount = await prisma.quickBooksToken.count();
  } catch {
    /* db error already hinted */
  }

  const slackUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  const slackEnabled = process.env.SLACK_NOTIFICATIONS_ENABLED?.trim();
  const slackEnvGate = process.env.SLACK_WEBHOOK_ENV?.trim();

  return NextResponse.json({
    requestHost,
    database: {
      urlSet: Boolean(dbUrlRaw),
      /** Parsed hostname only (no credentials). */
      hostname: databaseHostname,
      /** True when DATABASE_URL targets loopback; broken on Vercel deploys. */
      hostLooksLocal: databaseHostLooksLocal,
    },
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? 'set'
      : 'missing',
    quickbooks: {
      hasClientId: Boolean(process.env.QUICKBOOKS_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.QUICKBOOKS_CLIENT_SECRET?.trim()),
      oauthCredentialsConfigured: quickBooksOAuthCredentialsConfigured(),
      hasExplicitRedirectUri: Boolean(qbRedirect),
      /** False when QUICKBOOKS_REDIRECT_URI path is not the QuickBooks OAuth callback (e.g. Gmail URL by mistake). */
      explicitRedirectPathIsQuickBooks: quickBooksExplicitRedirectPathOk,
      effectiveOAuthCallback: qbRedirect || implicitQbRedirect,
      implicitQuickBooksOAuthCallback: implicitQbRedirect,
      redirectHost: qbRedirectHost,
      redirectMatchesRequestHost: qbRedirect ? redirectMatchesRequest : true,
      environment: getQuickBooksEnvironment(),
    },
    google: {
      /** Paste each URI into Google Cloud → OAuth Web client → Authorized redirect URIs */
      authorizedRedirectUrisChecklist: [
        nextAuthCallbackEffective,
        nextAuthCallbackFromRequest,
        gmailEffective,
        process.env.GOOGLE_REDIRECT_URI_GBP?.trim() || gbpCallbackImplicit,
      ].filter((uri, i, arr) => arr.indexOf(uri) === i),
      nextAuth: {
        secretSet: Boolean(process.env.NEXTAUTH_SECRET?.trim()),
        callbackPath: '/api/auth/callback/google',
        /** What NextAuth actually sends to Google when NEXTAUTH_URL is set. */
        fullCallbackUrl: nextAuthCallbackEffective,
        callbackUrlFromThisRequest: nextAuthCallbackFromRequest,
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
    reviewRequestEmail: {
      featureEnabled: reviewRequestEmailFeatureEnabled(),
      sendAsEmail: getReviewRequestSendAsEmail(),
      gmailMailboxConnected: reviewGmailReady,
      configured: reviewRequestEmailFeatureEnabled() && reviewGmailReady,
      hasReviewUrl: Boolean(process.env.REVIEW_REQUEST_REVIEW_URL?.trim()),
      attachInvoicePdfEnabled: reviewRequestEmailAttachInvoicePdfEnabled(),
      gmailSendScope:
        'OAuth must include https://www.googleapis.com/auth/gmail.send — reconnect the send mailbox in Settings after upgrading Dash.',
    },
    connections: {
      gmailMailboxesInDb: gmailConnectionCount,
      quickBooksCompaniesInDb: quickBooksConnectionCount,
      note: 'OAuth tokens live in the database. After fixing Vercel env, reconnect in Settings if connect still fails.',
    },
    slack: {
      webhookUrlSet: Boolean(slackUrl),
      notificationsEnabled: slackEnabled ? !/^(0|false|off|no)$/i.test(slackEnabled) : true,
      productionOnly: slackEnvGate === 'production',
      note:
        slackEnvGate === 'production'
          ? 'Webhooks only fire on Vercel Production when SLACK_WEBHOOK_ENV=production.'
          : null,
    },
    inboundWebhooks: {
      formLeadSecretSet: Boolean(process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim()),
      conversationSecretSet: Boolean(
        process.env.INBOUND_CONVERSATION_WEBHOOK_SECRET?.trim() || process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim(),
      ),
      voiceCallSecretSet: Boolean(
        process.env.INBOUND_VOICE_CALL_WEBHOOK_SECRET?.trim() || process.env.INBOUND_FORM_WEBHOOK_SECRET?.trim(),
      ),
      yelpLeadsTokenSet: Boolean(process.env.YELP_WEBHOOK_VERIFY_TOKEN?.trim()),
      paths: [
        `${origin}/api/webhooks/inbound-form-lead`,
        `${origin}/api/webhooks/inbound-conversation`,
        `${origin}/api/webhooks/inbound-voice-call`,
        `${origin}/api/webhooks/yelp-leads`,
      ],
    },
    googleDrive: {
      activeFolderConfigured: Boolean(process.env.GOOGLE_DRIVE_ACTIVE_FOLDER_ID?.trim()),
      completedFolderConfigured: Boolean(process.env.GOOGLE_DRIVE_COMPLETED_FOLDER_ID?.trim()),
      archiveFolderConfigured: Boolean(process.env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID?.trim()),
      note: 'Drive moves need GOOGLE_DRIVE_* env vars and a Gmail reconnect for Drive scope.',
    },
    openAi: {
      apiKeySet: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    hints,
  });
}
