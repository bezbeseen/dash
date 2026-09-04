import { prisma } from '@/lib/db/prisma';
import { GbpApiError, type GbpFailureReason } from '@/lib/google-business/api-errors';
import { fetchGbpLocationsResilient } from '@/lib/google-business/persisted-location-list';
import { fetchGrantedScopes, GBP_BUSINESS_MANAGE_SCOPE } from '@/lib/google-business/oauth';
import {
  fetchGbpMetricTotals,
  fetchGbpSearchKeywords,
  formatGbpMonthRange,
  formatGbpRange,
  gbpKeywordMonthRange,
  gbpKeywordMonthsForRange,
  gbpTrailingRange,
  GBP_DAILY_METRICS,
  type GbpMetricTotals,
  type GbpSearchKeyword,
} from '@/lib/google-business/performance-api';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

export const GBP_METRICS_RANGE_OPTIONS = [7, 28, 90] as const;

const DEFAULT_RANGE_DAYS = 28;

export function normalizeGbpMetricsRange(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '', 10);
  return GBP_METRICS_RANGE_OPTIONS.includes(parsed as (typeof GBP_METRICS_RANGE_OPTIONS)[number])
    ? parsed
    : DEFAULT_RANGE_DAYS;
}

export function normalizeGbpLocationIndex(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export type GbpMetricsLocationOption = { name: string; title: string };

export type GbpMetricsPageData =
  | { ok: false; kind: 'not_connected' }
  | { ok: false; kind: 'insufficient_scope'; googleEmail: string }
  | { ok: false; kind: 'no_locations'; googleEmail: string; accountCount: number }
  | {
      ok: false;
      kind: 'error';
      failure: GbpFailureReason;
      message: string;
      /** Request URL for the failed call, token-free, shown only for request-shape failures. */
      requestUrl: string | null;
      googleEmail: string | null;
    }
  | {
      ok: true;
      googleEmail: string;
      rangeDays: number;
      rangeLabel: string;
      selectedIndex: number;
      location: GbpMetricsLocationOption;
      allLocations: GbpMetricsLocationOption[];
      totals: GbpMetricTotals;
      previousTotals: GbpMetricTotals;
      searchKeywords: GbpSearchKeyword[];
      searchKeywordsUnavailable: boolean;
      /** Whole calendar months the keyword list covers, which the daily range cannot control. */
      searchKeywordsMonths: string;
      searchKeywordsUsedFallbackMonth: boolean;
      /** True when location names came from DB after a failed refresh (e.g. Account Management 429). */
      locationsFromStaleSnapshot: boolean;
      hasAnyData: boolean;
    };

async function missingPerformanceScope(googleEmail: string): Promise<boolean> {
  try {
    const token = await getValidGoogleBusinessAccessToken(googleEmail);
    const scopes = await fetchGrantedScopes(token);
    return !scopes.includes(GBP_BUSINESS_MANAGE_SCOPE);
  } catch {
    return false;
  }
}

function totalsSum(totals: GbpMetricTotals): number {
  let sum = 0;
  for (const metric of GBP_DAILY_METRICS) sum += totals[metric];
  return sum;
}

/** Google Business Profile performance for the connected listing, read server-side with stored OAuth tokens. */
export async function loadGbpMetricsPageData(
  rangeDays: number,
  locationIndex: number,
): Promise<GbpMetricsPageData> {
  const connection = await prisma.googleBusinessConnection.findFirst({
    orderBy: { googleEmail: 'asc' },
    select: { googleEmail: true },
  });
  if (!connection) {
    return { ok: false, kind: 'not_connected' };
  }

  const googleEmail = connection.googleEmail;

  try {
    const { accountCount, allLocations, source } = await fetchGbpLocationsResilient(googleEmail);
    if (accountCount === 0 || allLocations.length === 0) {
      return { ok: false, kind: 'no_locations', googleEmail, accountCount };
    }

    const selectedIndex = Math.min(locationIndex, allLocations.length - 1);
    const location = allLocations[selectedIndex];
    const token = await getValidGoogleBusinessAccessToken(googleEmail);

    const [totals, previousTotals] = await Promise.all([
      fetchGbpMetricTotals(token, location.name, rangeDays),
      fetchGbpMetricTotals(token, location.name, rangeDays, 1),
    ]);

    // Search keywords are a separate endpoint; losing them should not blank out the whole page.
    let searchKeywords: GbpSearchKeyword[] = [];
    let searchKeywordsUnavailable = false;
    let searchKeywordsMonths = formatGbpMonthRange(
      gbpKeywordMonthRange(gbpKeywordMonthsForRange(rangeDays)),
    );
    let searchKeywordsUsedFallbackMonth = false;
    try {
      const result = await fetchGbpSearchKeywords(token, location.name, rangeDays);
      searchKeywords = result.keywords;
      searchKeywordsMonths = formatGbpMonthRange(result.months);
      searchKeywordsUsedFallbackMonth = result.usedFallbackMonth;
    } catch {
      searchKeywordsUnavailable = true;
    }

    return {
      ok: true,
      googleEmail,
      rangeDays,
      rangeLabel: formatGbpRange(gbpTrailingRange(rangeDays)),
      selectedIndex,
      location,
      allLocations,
      totals,
      previousTotals,
      searchKeywords,
      searchKeywordsUnavailable,
      searchKeywordsMonths,
      searchKeywordsUsedFallbackMonth,
      locationsFromStaleSnapshot: source === 'db_stale',
      hasAnyData: totalsSum(totals) > 0,
    };
  } catch (e) {
    const apiError = e instanceof GbpApiError ? e : null;
    const message = e instanceof Error ? e.message : 'Could not load Google Business Profile metrics.';
    const failure = apiError?.reason ?? 'unknown';

    // Only a tokeninfo lookup can tell a narrow consent apart from a plain permission denial.
    if (
      (failure === 'scope' || failure === 'permission') &&
      (await missingPerformanceScope(googleEmail))
    ) {
      return { ok: false, kind: 'insufficient_scope', googleEmail };
    }

    return {
      ok: false,
      kind: 'error',
      failure,
      message,
      requestUrl: apiError?.url ?? null,
      googleEmail,
    };
  }
}
