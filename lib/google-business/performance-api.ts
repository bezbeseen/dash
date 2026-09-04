/** Business Profile Performance API - same OAuth scope as account/location listing (`business.manage`). */
import { gbpFetchJson } from '@/lib/google-business/api-client';
import { normalizeGbpLocationName } from '@/lib/google-business/resource-names';

export const GBP_PERFORMANCE_BASE = 'https://businessprofileperformance.googleapis.com/v1';

/**
 * Google finalises performance data 2-3 days late, so every range ends here instead of today.
 * Without the offset the newest window is always short and every delta reads falsely negative.
 */
export const GBP_REPORTING_LAG_DAYS = 3;

export const GBP_IMPRESSION_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
] as const;

export const GBP_ACTION_METRICS = [
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_CONVERSATIONS',
  'BUSINESS_BOOKINGS',
] as const;

export type GbpImpressionMetric = (typeof GBP_IMPRESSION_METRICS)[number];
export type GbpActionMetric = (typeof GBP_ACTION_METRICS)[number];
export type GbpDailyMetric = GbpImpressionMetric | GbpActionMetric;

export const GBP_DAILY_METRICS: readonly GbpDailyMetric[] = [
  ...GBP_IMPRESSION_METRICS,
  ...GBP_ACTION_METRICS,
];

export type GbpMetricTotals = Record<GbpDailyMetric, number>;

export const GBP_METRIC_LABELS: Record<GbpDailyMetric, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Search, desktop',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Search, mobile',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Maps, desktop',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Maps, mobile',
  CALL_CLICKS: 'Calls',
  WEBSITE_CLICKS: 'Website clicks',
  BUSINESS_DIRECTION_REQUESTS: 'Direction requests',
  BUSINESS_CONVERSATIONS: 'Messages',
  BUSINESS_BOOKINGS: 'Bookings',
};

type DatedValue = { date?: { year?: number; month?: number; day?: number }; value?: string };

type FetchMultiResponse = {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: Array<{
      dailyMetric?: string;
      timeSeries?: { datedValues?: DatedValue[] };
    }>;
  }>;
};

type SearchKeywordsResponse = {
  searchKeywordsCounts?: Array<{
    searchKeyword?: string;
    insightsValue?: { value?: string; threshold?: string };
  }>;
};

export type GbpDailyRange = { start: Date; end: Date };

export type GbpSearchKeyword = {
  keyword: string;
  count: number;
  /** Google hides low counts and returns only an upper bound instead of an exact value. */
  belowThreshold: boolean;
};

/** Full resource name ending in `locations/ID` to `locations/ID` for Performance API path. */
export function gbpPerformanceLocationPath(locationResourceName: string): string {
  return normalizeGbpLocationName(locationResourceName);
}

function num(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function sumDatedValues(datedValues: DatedValue[] | undefined): number {
  if (!datedValues?.length) return 0;
  let total = 0;
  for (const d of datedValues) total += num(d.value);
  return total;
}

/**
 * Trailing window of `days` ending `GBP_REPORTING_LAG_DAYS` before today (UTC calendar days).
 * `offsetPeriods: 1` gives the immediately preceding window.
 */
export function gbpTrailingRange(days: number, offsetPeriods = 0): GbpDailyRange {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - GBP_REPORTING_LAG_DAYS - offsetPeriods * days);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}

export function formatGbpRange(range: GbpDailyRange): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `${iso(range.start)} to ${iso(range.end)}`;
}

function emptyMetricTotals(): GbpMetricTotals {
  const totals = {} as GbpMetricTotals;
  for (const metric of GBP_DAILY_METRICS) totals[metric] = 0;
  return totals;
}

export function gbpDailyMetricsUrl(
  locationResourceName: string,
  metrics: readonly GbpDailyMetric[],
  range: GbpDailyRange,
): string {
  const location = normalizeGbpLocationName(locationResourceName);
  const params = new URLSearchParams();
  for (const metric of metrics) params.append('dailyMetrics', metric);
  params.set('dailyRange.start_date.year', String(range.start.getUTCFullYear()));
  params.set('dailyRange.start_date.month', String(range.start.getUTCMonth() + 1));
  params.set('dailyRange.start_date.day', String(range.start.getUTCDate()));
  params.set('dailyRange.end_date.year', String(range.end.getUTCFullYear()));
  params.set('dailyRange.end_date.month', String(range.end.getUTCMonth() + 1));
  params.set('dailyRange.end_date.day', String(range.end.getUTCDate()));
  return `${GBP_PERFORMANCE_BASE}/${location}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
}

export function gbpSearchKeywordsUrl(
  locationResourceName: string,
  range: GbpDailyRange,
  pageSize = 100,
): string {
  const location = normalizeGbpLocationName(locationResourceName);
  const params = new URLSearchParams({
    'monthlyRange.start_month.year': String(range.start.getUTCFullYear()),
    'monthlyRange.start_month.month': String(range.start.getUTCMonth() + 1),
    'monthlyRange.end_month.year': String(range.end.getUTCFullYear()),
    'monthlyRange.end_month.month': String(range.end.getUTCMonth() + 1),
    pageSize: String(pageSize),
  });
  return `${GBP_PERFORMANCE_BASE}/${location}/searchkeywords/impressions/monthly?${params.toString()}`;
}

export async function fetchGbpMetricTotals(
  accessToken: string,
  locationResourceName: string,
  days: number,
  offsetPeriods = 0,
): Promise<GbpMetricTotals> {
  const range = gbpTrailingRange(days, offsetPeriods);

  const body = await gbpFetchJson<FetchMultiResponse>(
    'GBP performance.fetchMultiDailyMetricsTimeSeries',
    gbpDailyMetricsUrl(locationResourceName, GBP_DAILY_METRICS, range),
    accessToken,
  );

  const totals = emptyMetricTotals();
  for (const group of body.multiDailyMetricTimeSeries ?? []) {
    for (const row of group.dailyMetricTimeSeries ?? []) {
      const metric = row.dailyMetric;
      // Sub-entity breakdowns can split one metric across several rows.
      if (metric && metric in totals) {
        totals[metric as GbpDailyMetric] += sumDatedValues(row.timeSeries?.datedValues);
      }
    }
  }
  return totals;
}

/** Search terms are only published per calendar month, so this covers the months the range touches. */
export async function fetchGbpSearchKeywords(
  accessToken: string,
  locationResourceName: string,
  days: number,
  limit = 10,
): Promise<GbpSearchKeyword[]> {
  const body = await gbpFetchJson<SearchKeywordsResponse>(
    'GBP performance.searchkeywords',
    gbpSearchKeywordsUrl(locationResourceName, gbpTrailingRange(days)),
    accessToken,
  );

  return (body.searchKeywordsCounts ?? [])
    .map((row) => {
      const exact = row.insightsValue?.value;
      const threshold = row.insightsValue?.threshold;
      return {
        keyword: row.searchKeyword?.trim() ?? '',
        count: num(exact ?? threshold),
        belowThreshold: exact === undefined && threshold !== undefined,
      };
    })
    .filter((row) => row.keyword.length > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
