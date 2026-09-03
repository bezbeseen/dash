import { getGa4PropertyId } from '@/lib/analytics/ga4-config';

const BASE = 'https://analyticsdata.googleapis.com/v1beta';

type Ga4DateRange = { startDate: string; endDate: string };

type Ga4ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
};

export type Ga4Totals = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  /** Seconds. */
  averageSessionDuration: number;
  /** Fraction 0–1. */
  bounceRate: number;
};

export type Ga4NamedCount = { name: string; count: number };

const SUMMARY_METRICS = [
  'activeUsers',
  'newUsers',
  'sessions',
  'screenPageViews',
  'averageSessionDuration',
  'bounceRate',
] as const;

/** Trailing window ending today; `offsetPeriods: 1` gives the immediately preceding window. */
export function ga4TrailingRange(days: number, offsetPeriods = 0): Ga4DateRange {
  const endAgo = offsetPeriods * days;
  const startAgo = endAgo + days - 1;
  return {
    startDate: `${startAgo}daysAgo`,
    endDate: endAgo === 0 ? 'today' : `${endAgo}daysAgo`,
  };
}

function num(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function runReport(token: string, body: Record<string, unknown>): Promise<Ga4ReportResponse> {
  const propertyId = getGa4PropertyId();
  if (!propertyId) {
    throw new Error('GA4_PROPERTY_ID is not set to a numeric GA4 property ID.');
  }

  const res = await fetch(`${BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GA4 Data API ${res.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text) as Ga4ReportResponse;
  } catch {
    throw new Error('GA4 Data API returned invalid JSON.');
  }
}

export async function fetchGa4Totals(
  token: string,
  days: number,
  offsetPeriods = 0,
): Promise<Ga4Totals> {
  const report = await runReport(token, {
    dateRanges: [ga4TrailingRange(days, offsetPeriods)],
    metrics: SUMMARY_METRICS.map((name) => ({ name })),
  });

  const values = report.totals?.[0]?.metricValues ?? report.rows?.[0]?.metricValues ?? [];
  const byIndex = (i: number) => num(values[i]?.value);

  return {
    activeUsers: byIndex(0),
    newUsers: byIndex(1),
    sessions: byIndex(2),
    screenPageViews: byIndex(3),
    averageSessionDuration: byIndex(4),
    bounceRate: byIndex(5),
  };
}

async function fetchGa4Breakdown(
  token: string,
  days: number,
  dimension: string,
  metric: string,
  limit: number,
): Promise<Ga4NamedCount[]> {
  const report = await runReport(token, {
    dateRanges: [ga4TrailingRange(days)],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
  });

  return (report.rows ?? []).map((row) => ({
    name: row.dimensionValues?.[0]?.value?.trim() || '(not set)',
    count: num(row.metricValues?.[0]?.value),
  }));
}

export function fetchGa4TopPages(token: string, days: number, limit = 10): Promise<Ga4NamedCount[]> {
  return fetchGa4Breakdown(token, days, 'pagePath', 'screenPageViews', limit);
}

export function fetchGa4Channels(token: string, days: number, limit = 8): Promise<Ga4NamedCount[]> {
  return fetchGa4Breakdown(token, days, 'sessionDefaultChannelGroup', 'sessions', limit);
}

export function fetchGa4Devices(token: string, days: number, limit = 5): Promise<Ga4NamedCount[]> {
  return fetchGa4Breakdown(token, days, 'deviceCategory', 'sessions', limit);
}
