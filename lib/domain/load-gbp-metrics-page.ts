import { prisma } from '@/lib/db/prisma';
import { fetchGbpLocationsResilient } from '@/lib/google-business/persisted-location-list';
import { fetchGrantedScopes, GBP_BUSINESS_MANAGE_SCOPE } from '@/lib/google-business/oauth';
import {
  fetchGbpMetricTotals,
  fetchGbpSearchKeywords,
  formatGbpRange,
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

export type GbpFailureKind = 'api_disabled' | 'quota' | 'permission' | 'unknown';

export type GbpMetricsPageData =
  | { ok: false; kind: 'not_connected' }
  | { ok: false; kind: 'insufficient_scope'; googleEmail: string }
  | { ok: false; kind: 'no_locations'; googleEmail: string; accountCount: number }
  | { ok: false; kind: 'error'; failure: GbpFailureKind; message: string; googleEmail: string | null }
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
      /** True when location names came from DB after a failed refresh (e.g. Account Management 429). */
      locationsFromStaleSnapshot: boolean;
      hasAnyData: boolean;
    };

/** `SERVICE_DISABLED` also arrives as a 403, so the disabled check has to run before the generic one. */
function classifyGbpFailure(message: string): GbpFailureKind {
  if (/SERVICE_DISABLED|has not been used in project|API is disabled/i.test(message)) {
    return 'api_disabled';
  }
  if (/RESOURCE_EXHAUSTED|Quota exceeded|rateLimitExceeded|\b429\b/i.test(message)) {
    return 'quota';
  }
  if (/PERMISSION_DENIED|\b403\b/i.test(message)) {
    return 'permission';
  }
  return 'unknown';
}

function looksLikeScopeFailure(message: string): boolean {
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|insufficient_scope|\b401\b/i.test(
    message,
  );
}

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
    try {
      searchKeywords = await fetchGbpSearchKeywords(token, location.name, rangeDays);
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
      locationsFromStaleSnapshot: source === 'db_stale',
      hasAnyData: totalsSum(totals) > 0,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load Google Business Profile metrics.';
    const failure = classifyGbpFailure(message);
    if (
      (looksLikeScopeFailure(message) || failure === 'permission') &&
      (await missingPerformanceScope(googleEmail))
    ) {
      return { ok: false, kind: 'insufficient_scope', googleEmail };
    }
    return { ok: false, kind: 'error', failure, message, googleEmail };
  }
}
