/** Business Profile Performance API - same OAuth scope as account/location listing (`business.manage`). */

const BASE = 'https://businessprofileperformance.googleapis.com/v1';

/** Metrics we surface in Dash (labels in UI). */
export const GBP_DAILY_METRICS = [
  'WEBSITE_CLICKS',
  'CALL_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
] as const;

export type GbpDailyMetric = (typeof GBP_DAILY_METRICS)[number];

export const GBP_METRIC_LABELS: Record<string, string> = {
  WEBSITE_CLICKS: 'Website clicks',
  CALL_CLICKS: 'Call clicks',
  BUSINESS_DIRECTION_REQUESTS: 'Direction requests',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Impressions (Maps, desktop)',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Impressions (Maps, mobile)',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Impressions (Search, desktop)',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Impressions (Search, mobile)',
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

/** Full resource name ending in `locations/ID` to `locations/ID` for Performance API path. */
export function gbpPerformanceLocationPath(locationResourceName: string): string {
  const m = locationResourceName.match(/(locations\/[^/]+)$/);
  if (!m) {
    throw new Error(`Invalid GBP location resource: ${locationResourceName}`);
  }
  return m[1];
}

function sumDatedValues(datedValues: DatedValue[] | undefined): number {
  if (!datedValues?.length) return 0;
  let n = 0;
  for (const d of datedValues) {
    const v = d.value;
    if (v === undefined || v === '') continue;
    const parsed = Number(v);
    if (!Number.isNaN(parsed)) n += parsed;
  }
  return n;
}

/** Last `days` days inclusive of end date (UTC calendar days). */
export function utcDayRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - (days - 1));
  return { start: startUtc, end: endUtc };
}

export async function fetchGbpLocationMetricTotals(
  accessToken: string,
  locationResourceName: string,
  metrics: readonly GbpDailyMetric[],
  rangeDays: number,
): Promise<{ metric: string; total: number }[]> {
  const loc = gbpPerformanceLocationPath(locationResourceName);
  const { start, end } = utcDayRange(rangeDays);

  const params = new URLSearchParams();
  for (const m of metrics) params.append('dailyMetrics', m);
  params.set('dailyRange.start_date.year', String(start.getUTCFullYear()));
  params.set('dailyRange.start_date.month', String(start.getUTCMonth() + 1));
  params.set('dailyRange.start_date.day', String(start.getUTCDate()));
  params.set('dailyRange.end_date.year', String(end.getUTCFullYear()));
  params.set('dailyRange.end_date.month', String(end.getUTCMonth() + 1));
  params.set('dailyRange.end_date.day', String(end.getUTCDate()));

  const url = `${BASE}/${loc}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GBP Performance API ${res.status}: ${t.slice(0, 1200)}`);
  }

  const body = (await res.json()) as FetchMultiResponse;
  const series = body.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries ?? [];

  const byMetric = new Map<string, number>();
  for (const row of series) {
    const key = row.dailyMetric;
    if (!key) continue;
    byMetric.set(key, sumDatedValues(row.timeSeries?.datedValues));
  }

  return metrics.map((metric) => ({
    metric,
    total: byMetric.get(metric) ?? 0,
  }));
}
