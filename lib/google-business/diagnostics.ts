import { prisma } from '@/lib/db/prisma';
import {
  GbpApiError,
  redactUrl,
  type GbpFailureReason,
  type GbpResponseBodyKind,
} from '@/lib/google-business/api-errors';
import { listGbpAccounts, listGbpLocations } from '@/lib/google-business/account-api';
import { gbpAccountsListUrl, gbpLocationsListUrl } from '@/lib/google-business/api-urls';
import { fetchGrantedScopes, GBP_BUSINESS_MANAGE_SCOPE } from '@/lib/google-business/oauth';
import {
  fetchGbpMetricTotals,
  fetchGbpSearchKeywords,
  formatGbpMonthRange,
  gbpDailyMetricsUrl,
  gbpKeywordMonthRange,
  gbpKeywordMonthsForRange,
  gbpSearchKeywordsUrl,
  gbpTrailingRange,
  GBP_DAILY_METRICS,
} from '@/lib/google-business/performance-api';
import { normalizeGbpAccountName, normalizeGbpLocationName } from '@/lib/google-business/resource-names';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

const PROBE_DAYS = 7;

export type GbpAccessProbe = {
  connectedEmail: string | null;
  grantedScopes: string[] | null;
  hasBusinessManageScope: boolean | null;
  accountCount: number | null;
  locationCount: number | null;
  /** `accounts/{id}` used as the locations.list parent. */
  accountResourceName: string | null;
  /** `locations/{id}` used for Performance API calls. */
  locationResourceName: string | null;
  urls: { accountsList: string; locationsList: string | null; dailyMetrics: string | null };
  /** Last call attempted, so a failure below can be tied to a specific request. */
  lastStep: 'tokeninfo' | 'accounts.list' | 'locations.list' | 'performance' | null;
  failedUrl: string | null;
  httpStatus: number | null;
  responseBodyKind: GbpResponseBodyKind | null;
  failureReason: GbpFailureReason | null;
  performanceApiOk: boolean | null;
  error: string | null;
  /** Tracked apart from the daily metrics: this endpoint answers only in whole calendar months. */
  searchKeywords: {
    months: string;
    url: string;
    returned: number | null;
    usedFallbackMonth: boolean | null;
    error: string | null;
  } | null;
};

function emptyProbe(): GbpAccessProbe {
  return {
    connectedEmail: null,
    grantedScopes: null,
    hasBusinessManageScope: null,
    accountCount: null,
    locationCount: null,
    accountResourceName: null,
    locationResourceName: null,
    urls: { accountsList: gbpAccountsListUrl(), locationsList: null, dailyMetrics: null },
    lastStep: null,
    failedUrl: null,
    httpStatus: null,
    responseBodyKind: null,
    failureReason: null,
    performanceApiOk: null,
    error: null,
    searchKeywords: null,
  };
}

export function gbpProbeUnavailable(error: string): GbpAccessProbe {
  return { ...emptyProbe(), performanceApiOk: false, error };
}

/**
 * End-to-end read check for the GBP pipeline. Calls the live endpoints rather than the cached
 * location snapshot, since the point is to see the real request URLs and Google's real answers.
 */
export async function probeGbpPerformanceAccess(): Promise<GbpAccessProbe> {
  const connection = await prisma.googleBusinessConnection.findFirst({
    orderBy: { googleEmail: 'asc' },
    select: { googleEmail: true },
  });
  if (!connection) return emptyProbe();

  const probe = emptyProbe();
  probe.connectedEmail = connection.googleEmail;

  try {
    const token = await getValidGoogleBusinessAccessToken(connection.googleEmail);

    probe.lastStep = 'tokeninfo';
    try {
      const scopes = await fetchGrantedScopes(token);
      probe.grantedScopes = scopes;
      probe.hasBusinessManageScope = scopes.includes(GBP_BUSINESS_MANAGE_SCOPE);
    } catch {
      probe.grantedScopes = null;
    }

    probe.lastStep = 'accounts.list';
    const { accounts } = await listGbpAccounts(token);
    probe.accountCount = accounts?.length ?? 0;

    const firstAccount = accounts?.[0]?.name;
    if (!firstAccount) {
      probe.error = 'Google returned no Business Profile accounts for this login.';
      return probe;
    }
    probe.accountResourceName = normalizeGbpAccountName(firstAccount);
    probe.urls.locationsList = gbpLocationsListUrl(probe.accountResourceName);

    probe.lastStep = 'locations.list';
    const { locations } = await listGbpLocations(token, probe.accountResourceName);
    probe.locationCount = locations?.length ?? 0;

    const firstLocation = locations?.[0]?.name;
    if (!firstLocation) {
      probe.error = 'The first Business Profile account returned no locations.';
      return probe;
    }
    probe.locationResourceName = normalizeGbpLocationName(firstLocation);
    probe.urls.dailyMetrics = gbpDailyMetricsUrl(
      probe.locationResourceName,
      GBP_DAILY_METRICS,
      gbpTrailingRange(PROBE_DAYS),
    );

    probe.lastStep = 'performance';
    await fetchGbpMetricTotals(token, probe.locationResourceName, PROBE_DAYS);
    probe.performanceApiOk = true;

    const keywordMonths = gbpKeywordMonthRange(gbpKeywordMonthsForRange(PROBE_DAYS));
    probe.searchKeywords = {
      months: formatGbpMonthRange(keywordMonths),
      url: redactUrl(gbpSearchKeywordsUrl(probe.locationResourceName, keywordMonths)),
      returned: null,
      usedFallbackMonth: null,
      error: null,
    };
    try {
      const keywords = await fetchGbpSearchKeywords(token, probe.locationResourceName, PROBE_DAYS);
      probe.searchKeywords = {
        months: formatGbpMonthRange(keywords.months),
        url: redactUrl(gbpSearchKeywordsUrl(probe.locationResourceName, keywords.months)),
        returned: keywords.keywords.length,
        usedFallbackMonth: keywords.usedFallbackMonth,
        error: null,
      };
    } catch (e) {
      probe.searchKeywords.error = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    }
    return probe;
  } catch (e) {
    probe.performanceApiOk = false;
    if (e instanceof GbpApiError) {
      probe.failedUrl = e.url;
      probe.httpStatus = e.httpStatus;
      probe.responseBodyKind = e.bodyKind;
      probe.failureReason = e.reason;
    }
    probe.error = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    return probe;
  }
}
