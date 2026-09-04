import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getQuickBooksEnvironment, getQuickBooksSyncMaxResults, QUICKBOOKS_OAUTH_CALLBACK_PATH } from '@/lib/quickbooks/config';
import { probeQuickBooksApiAccess } from '@/lib/quickbooks/client';
import {
  quickBooksClientIdFingerprint,
  quickBooksOAuthCredentialsConfigured,
} from '@/lib/quickbooks/oauth';
import { GMAIL_OAUTH_CALLBACK_PATH } from '@/lib/gmail/config';
import { resolveYelpLeadMailboxState, type YelpMailboxState } from '@/lib/yelp/lead-mailbox';
import { GBP_OAUTH_CALLBACK_PATH } from '@/lib/google-business/config';
import {
  gbpProbeUnavailable,
  probeGbpPerformanceAccess,
  type GbpAccessProbe,
} from '@/lib/google-business/diagnostics';
import { GBP_REPORTING_LAG_DAYS } from '@/lib/google-business/performance-api';
import {
  ga4ReportingConfigured,
  getGa4PropertyId,
  getGa4ServiceAccountEmail,
} from '@/lib/analytics/ga4-config';
import {
  CLARITY_DAILY_REQUEST_LIMIT,
  CLARITY_MAX_LOOKBACK_DAYS,
  clarityInsightsConfigured,
  getClarityApiToken,
  getClarityLinks,
  getClarityProjectId,
} from '@/lib/analytics/clarity-config';
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
  } else {
    const fp = quickBooksClientIdFingerprint();
    if (fp.hadWrappingQuotes) {
      hints.push(
        'QUICKBOOKS_CLIENT_ID on Vercel has extra wrapping quotes — remove them (paste the raw Client ID only, no "quotes").',
      );
    }
    if (fp.length > 0 && fp.length < 40) {
      hints.push(
        `QUICKBOOKS_CLIENT_ID looks too short (${fp.length} chars). Intuit "undefined didn't connect" usually means the wrong key — copy Production Client ID from developer.intuit.com (Keys & credentials → Production), not Development.`,
      );
    }
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
  if (getClarityProjectId() && !getClarityApiToken()) {
    hints.push(
      'Microsoft Clarity is recording but CLARITY_API_TOKEN is unset, so /dashboard/analytics cannot show its numbers. Clarity → project → Settings → Data Export → Generate new API token.',
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

  // Same resolver the scan route uses, so this diagnostic cannot disagree with runtime.
  let yelpLeadMailbox: YelpMailboxState | null = null;
  let yelpLeadTicketCount = -1;
  try {
    yelpLeadMailbox = await resolveYelpLeadMailboxState(null);
    yelpLeadTicketCount = await prisma.job.count({ where: { inboundLeadKind: 'YELP_LEAD' } });
  } catch {
    /* db error already hinted */
  }

  let gmailConnectionCount = -1;
  let quickBooksConnectionCount = -1;
  let quickBooksRealmId: string | null = null;
  try {
    gmailConnectionCount = await prisma.gmailConnection.count();
    quickBooksConnectionCount = await prisma.quickBooksToken.count();
    const qbRow = await prisma.quickBooksToken.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { realmId: true },
    });
    quickBooksRealmId = qbRow?.realmId ?? null;
  } catch {
    /* db error already hinted */
  }

  let quickBooksApiProbe: { ok: boolean; apiBase: string; error?: string } | null = null;
  if (quickBooksRealmId) {
    try {
      quickBooksApiProbe = await Promise.race([
        probeQuickBooksApiAccess(quickBooksRealmId),
        new Promise<{ ok: false; apiBase: string; error: string }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: false,
                apiBase:
                  getQuickBooksEnvironment() === 'production'
                    ? 'quickbooks.api.intuit.com'
                    : 'sandbox-quickbooks.api.intuit.com',
                error: 'QuickBooks API probe timed out after 4s (Intuit may be slow or token refresh failed).',
              }),
            4000,
          ),
        ),
      ]);
      if (!quickBooksApiProbe.ok) {
        hints.push(
          `QuickBooks API probe failed: ${quickBooksApiProbe.error ?? 'unknown'}. If you changed QUICKBOOKS_CLIENT_ID/SECRET on Vercel, reconnect QuickBooks in Settings (old refresh tokens won't work).`,
        );
      }
    } catch (e) {
      quickBooksApiProbe = {
        ok: false,
        apiBase:
          getQuickBooksEnvironment() === 'production'
            ? 'quickbooks.api.intuit.com'
            : 'sandbox-quickbooks.api.intuit.com',
        error: e instanceof Error ? e.message.slice(0, 200) : 'probe_failed',
      };
    }
  }

  let gbpAccessProbe: GbpAccessProbe | null = null;
  if (gbpConnections > 0) {
    try {
      gbpAccessProbe = await Promise.race([
        probeGbpPerformanceAccess(),
        new Promise<GbpAccessProbe>((resolve) =>
          setTimeout(() => resolve(gbpProbeUnavailable('GBP probe timed out after 6s.')), 6000),
        ),
      ]);
      if (gbpAccessProbe.hasBusinessManageScope === false) {
        hints.push(
          'The stored Google Business Profile token is missing https://www.googleapis.com/auth/business.manage. Reconnect Google Business Profile in Settings to grant the performance scope.',
        );
      } else if (gbpAccessProbe.failureReason === 'endpoint' || gbpAccessProbe.failureReason === 'bad_request') {
        hints.push(
          `Google Business Profile ${gbpAccessProbe.lastStep ?? 'request'} was rejected before reaching the API (HTTP ${gbpAccessProbe.httpStatus ?? '?'}, ${gbpAccessProbe.responseBodyKind ?? 'unknown'} body). This is a malformed request URL in Dash, not a Google Cloud approval problem. Compare accessProbe.failedUrl against the documented endpoint.`,
        );
      } else if (gbpAccessProbe.failureReason === 'api_disabled') {
        hints.push(
          'The Business Profile APIs are not enabled on the project behind GOOGLE_CLIENT_ID. Enable businessprofileperformance.googleapis.com, mybusinessaccountmanagement.googleapis.com, and mybusinessbusinessinformation.googleapis.com.',
        );
      } else if (gbpAccessProbe.failureReason === 'quota') {
        hints.push(
          "Google is refusing Business Profile calls for quota reasons. If the project's quota reads 0 requests/minute it was never approved, so submit Google's Business Profile API access form; otherwise wait and retry.",
        );
      } else if (gbpAccessProbe.performanceApiOk === false) {
        hints.push(
          `Google Business Profile probe failed at ${gbpAccessProbe.lastStep ?? 'an unknown step'}: ${gbpAccessProbe.error ?? 'unknown'}`,
        );
      }
    } catch (e) {
      gbpAccessProbe = gbpProbeUnavailable(e instanceof Error ? e.message.slice(0, 200) : 'probe_failed');
    }
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
      clientIdFingerprint: quickBooksClientIdFingerprint(),
      hasExplicitRedirectUri: Boolean(qbRedirect),
      /** False when QUICKBOOKS_REDIRECT_URI path is not the QuickBooks OAuth callback (e.g. Gmail URL by mistake). */
      explicitRedirectPathIsQuickBooks: quickBooksExplicitRedirectPathOk,
      effectiveOAuthCallback: qbRedirect || implicitQbRedirect,
      implicitQuickBooksOAuthCallback: implicitQbRedirect,
      redirectHost: qbRedirectHost,
      redirectMatchesRequestHost: qbRedirect ? redirectMatchesRequest : true,
      environment: getQuickBooksEnvironment(),
      syncMaxResults: getQuickBooksSyncMaxResults(),
      storedRealmId: quickBooksRealmId,
      apiProbe: quickBooksApiProbe,
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
      requiredScope: 'https://www.googleapis.com/auth/business.manage',
      /** Live read check: token, granted scopes, resolved location, and one Performance API call. */
      accessProbe: gbpAccessProbe,
      quotaCheck:
        'https://console.cloud.google.com/apis/api/businessprofileperformance.googleapis.com/quotas — 0 requests/minute means the project is not approved yet.',
      requestAccessForm:
        'https://support.google.com/business/contact/api_default — choose "Application for Basic API Access" and give the Cloud project number. Approved projects get 300 QPM.',
      reportingLagDays: GBP_REPORTING_LAG_DAYS,
      dashboardPath: '/dashboard/gbp',
    },
    yelpFusion: {
      hasApiKey: Boolean(process.env.YELP_API_KEY?.trim()),
    },
    /**
     * Primary Yelp lead path: Dash reads Yelp notification emails, because the
     * Leads API is gated to advertising resellers with a minimum spend.
     */
    yelpLeadEmails: {
      /** Address the scan will actually read. */
      mailbox: yelpLeadMailbox?.mailbox ?? null,
      /** YELP_LEAD_EMAIL_MAILBOX, REVIEW_REQUEST_SEND_AS_EMAIL, or the built-in default. */
      mailboxSource: yelpLeadMailbox?.source ?? null,
      mailboxFromEnv: yelpLeadMailbox?.fromEnv ?? null,
      mailboxConnectedToGmail: yelpLeadMailbox?.connected ?? null,
      configured: yelpLeadMailbox?.ready ?? false,
      /** Listed so an address mismatch is obvious without opening the database. */
      connectedMailboxes: yelpLeadMailbox?.connectedMailboxes ?? [],
      notReadyReason: yelpLeadMailbox?.reason ?? null,
      ticketsImported: yelpLeadTicketCount,
      previewUrl: `${origin}/api/integrations/yelp/scan-emails`,
      note: 'Optional YELP_LEAD_EMAIL_MAILBOX overrides the review-request send-as mailbox. That mailbox must appear in connectedMailboxes.',
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
      /** Shared secret Yelp sends back to us (?token=, Bearer, or X-Dash-Yelp-Secret). */
      yelpLeadsVerifyTokenSet: Boolean(process.env.YELP_WEBHOOK_VERIFY_TOKEN?.trim()),
      /** Separate OAuth bearer Dash uses to call the Leads API; without it the webhook returns 503. */
      yelpLeadsAccessTokenSet: Boolean(process.env.YELP_LEADS_ACCESS_TOKEN?.trim()),
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
    analytics: {
      vercelWebAnalytics: 'Enable in Vercel → Project → Analytics (component is in app layout; no env var).',
      vercelSpeedInsights: 'Enable in Vercel → Project → Speed Insights.',
      ga4MeasurementIdSet: Boolean(
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() &&
          process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID.trim() !== 'replace-me',
      ),
      clarityProjectIdSet: Boolean(
        process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() &&
          process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID.trim() !== 'replace-me',
      ),
      /** GA4 Data API read-only reporting behind /dashboard/analytics. */
      ga4Reporting: {
        configured: ga4ReportingConfigured(),
        propertyId: getGa4PropertyId(),
        serviceAccountEmail: getGa4ServiceAccountEmail(),
        grantAccessAt: 'GA4 → Admin → Property access management → add the service account email as Viewer.',
      },
      /** Clarity Data Export API read behind the Clarity section of /dashboard/analytics. */
      clarityDataExport: {
        configured: clarityInsightsConfigured(),
        apiTokenSet: Boolean(getClarityApiToken()),
        projectId: getClarityProjectId(),
        generateTokenAt: 'Clarity → your project → Settings → Data Export → Generate new API token (project admins only).',
        quota: `${CLARITY_DAILY_REQUEST_LIMIT} requests per project per day, last ${CLARITY_MAX_LOOKBACK_DAYS} days only. Dash caches one snapshot for 6 hours.`,
        /** Signed-in only. The cached read is free; ?fresh=1 is the only variant that costs quota. */
        rawPayloadDiagnostic: `${origin}/api/integrations/clarity?raw=1`,
        rawPayloadDiagnosticLive: `${origin}/api/integrations/clarity?fresh=1&raw=1`,
        deepLinks: getClarityLinks(),
      },
    },
    hints,
  });
}
