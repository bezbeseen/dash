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

export type GbpSearchKeywordsResponse = {
  searchKeywordsCounts?: Array<{
    searchKeyword?: string;
    insightsValue?: { value?: string; threshold?: string };
  }>;
};

export type GbpDailyRange = { start: Date; end: Date };

/** Year plus month only; the endpoint ignores the day component of a `MonthlyRange`. */
export type GbpMonthRange = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
};

export type GbpSearchKeyword = {
  keyword: string;
  count: number;
  /** Google hides low counts and returns only an upper bound instead of an exact value. */
  belowThreshold: boolean;
};

export type GbpSearchKeywordsResult = {
  keywords: GbpSearchKeyword[];
  months: GbpMonthRange;
  /** True when the newest complete month held nothing and Dash stepped back another month. */
  usedFallbackMonth: boolean;
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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Search keywords are published per whole calendar month and the current month is never available,
 * so ranges are built from complete months and never from the daily selector. `monthsAgo` steps
 * further back for when the newest complete month has not been published yet.
 */
export function gbpKeywordMonthRange(
  monthsCovered: number,
  monthsAgo = 0,
  now: Date = new Date(),
): GbpMonthRange {
  const currentMonth = toMonthIndex(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const lastComplete = currentMonth - 1 - Math.max(0, monthsAgo);
  const first = lastComplete - (Math.max(1, monthsCovered) - 1);
  const start = fromMonthIndex(first);
  const end = fromMonthIndex(lastComplete);
  return {
    startYear: start.year,
    startMonth: start.month,
    endYear: end.year,
    endMonth: end.month,
  };
}

/** A monthly endpoint cannot answer a 7-day question, so short ranges map to one whole month. */
export function gbpKeywordMonthsForRange(days: number): number {
  return days >= 90 ? 3 : 1;
}

export function formatGbpMonthRange(range: GbpMonthRange): string {
  const start = `${MONTH_NAMES[range.startMonth - 1]} ${range.startYear}`;
  const end = `${MONTH_NAMES[range.endMonth - 1]} ${range.endYear}`;
  return start === end ? start : `${start} to ${end}`;
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

/** Documented maximum, which is also the default. */
export const GBP_KEYWORD_PAGE_SIZE = 100;

export function gbpSearchKeywordsUrl(
  locationResourceName: string,
  months: GbpMonthRange,
  pageSize = GBP_KEYWORD_PAGE_SIZE,
): string {
  const location = normalizeGbpLocationName(locationResourceName);
  const params = new URLSearchParams({
    'monthlyRange.start_month.year': String(months.startYear),
    'monthlyRange.start_month.month': String(months.startMonth),
    'monthlyRange.end_month.year': String(months.endYear),
    'monthlyRange.end_month.month': String(months.endMonth),
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

export function parseGbpSearchKeywords(
  body: GbpSearchKeywordsResponse,
  limit: number,
): GbpSearchKeyword[] {
  return (body.searchKeywordsCounts ?? [])
    .map((row) => {
      const exact = row.insightsValue?.value;
      const threshold = row.insightsValue?.threshold;
      return {
        keyword: row.searchKeyword?.trim() ?? '',
        // A threshold-only entry is Google withholding a small count, not a missing value.
        count: num(exact ?? threshold),
        belowThreshold: exact === undefined && threshold !== undefined,
      };
    })
    .filter((row) => row.keyword.length > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** How many extra whole months to try when the newest complete month is not published yet. */
const KEYWORD_MONTH_FALLBACKS = 1;

export async function fetchGbpSearchKeywords(
  accessToken: string,
  locationResourceName: string,
  days: number,
  limit = 10,
): Promise<GbpSearchKeywordsResult> {
  const monthsCovered = gbpKeywordMonthsForRange(days);
  let result: GbpSearchKeywordsResult = {
    keywords: [],
    months: gbpKeywordMonthRange(monthsCovered),
    usedFallbackMonth: false,
  };

  for (let monthsAgo = 0; monthsAgo <= KEYWORD_MONTH_FALLBACKS; monthsAgo += 1) {
    const months = gbpKeywordMonthRange(monthsCovered, monthsAgo);
    const body = await gbpFetchJson<GbpSearchKeywordsResponse>(
      'GBP performance.searchkeywords',
      gbpSearchKeywordsUrl(locationResourceName, months),
      accessToken,
    );
    result = { keywords: parseGbpSearchKeywords(body, limit), months, usedFallbackMonth: monthsAgo > 0 };
    if (result.keywords.length > 0) break;
  }

  return result;
}
