const CLARITY_INSIGHTS_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

type ClarityInfoRow = Record<string, unknown>;
type ClarityMetricEntry = { metricName?: string; information?: ClarityInfoRow[] };

export type ClarityTraffic = {
  sessions: number;
  botSessions: number;
  distinctUsers: number;
  pagesPerSession: number;
};

/** Frustration signal: the share of sessions Clarity flagged, plus the raw occurrence count. */
export type ClaritySignal = {
  key: string;
  label: string;
  /** Percentage 0-100. */
  sessionPercentage: number;
  occurrences: number;
};

export type ClarityInsights = {
  numOfDays: number;
  traffic: ClarityTraffic;
  /** Percentage 0-100, or null when Clarity omitted the metric. */
  averageScrollDepth: number | null;
  totalEngagementSeconds: number | null;
  activeEngagementSeconds: number | null;
  signals: ClaritySignal[];
};

export class ClarityApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClarityApiError';
    this.status = status;
  }
}

const SIGNAL_METRICS = [
  { metricName: 'DeadClickCount', label: 'Dead clicks' },
  { metricName: 'RageClickCount', label: 'Rage clicks' },
  { metricName: 'ExcessiveScroll', label: 'Excessive scrolling' },
  { metricName: 'QuickbackClick', label: 'Quick backs' },
  { metricName: 'ScriptErrorCount', label: 'Script errors' },
  { metricName: 'ErrorClickCount', label: 'Error clicks' },
] as const;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Clarity documents metric names but not field names, and mixes casing within a single row
 * (`totalSessionCount` next to `PagesPerSessionPercentage`), so read case-insensitively and
 * accept the aliases seen in the docs and in the wild.
 */
function pickNumber(row: ClarityInfoRow | undefined, keys: readonly string[]): number | null {
  if (!row) return null;
  const byLowerKey = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = byLowerKey.get(key.toLowerCase());
    if (actual === undefined) continue;
    const parsed = toNumber(row[actual]);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Requests carry no dimensions, so each metric comes back as a single project-wide row. */
function metricRow(entries: ClarityMetricEntry[], metricName: string): ClarityInfoRow | undefined {
  const entry = entries.find(
    (candidate) => candidate.metricName?.toLowerCase() === metricName.toLowerCase(),
  );
  return entry?.information?.[0];
}

function mapInsights(entries: ClarityMetricEntry[], numOfDays: number): ClarityInsights {
  const traffic = metricRow(entries, 'Traffic');
  const engagement = metricRow(entries, 'EngagementTime');
  const scroll = metricRow(entries, 'ScrollDepth');

  return {
    numOfDays,
    traffic: {
      sessions: pickNumber(traffic, ['totalSessionCount', 'sessionsCount']) ?? 0,
      botSessions: pickNumber(traffic, ['totalBotSessionCount']) ?? 0,
      distinctUsers: pickNumber(traffic, ['distantUserCount', 'distinctUserCount']) ?? 0,
      pagesPerSession: pickNumber(traffic, ['PagesPerSessionPercentage', 'pagesPerSession']) ?? 0,
    },
    averageScrollDepth: pickNumber(scroll, ['averageScrollDepth', 'scrollDepth']),
    totalEngagementSeconds: pickNumber(engagement, ['totalTime', 'totalEngagementTime']),
    activeEngagementSeconds: pickNumber(engagement, ['activeTime', 'activeTimeSpent']),
    signals: SIGNAL_METRICS.map(({ metricName, label }) => {
      const row = metricRow(entries, metricName);
      return {
        key: metricName,
        label,
        sessionPercentage: pickNumber(row, ['sessionsWithMetricPercentage']) ?? 0,
        occurrences: pickNumber(row, ['subTotal']) ?? 0,
      };
    }),
  };
}

export async function fetchClarityInsights(token: string, numOfDays: number): Promise<ClarityInsights> {
  const res = await fetch(`${CLARITY_INSIGHTS_URL}?numOfDays=${encodeURIComponent(String(numOfDays))}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // Clarity answers rate limits and outages with an empty body, so fall back to the status text.
    throw new ClarityApiError(res.status, text.trim().slice(0, 400) || res.statusText || 'empty response body');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClarityApiError(res.status, 'Clarity returned a non-JSON response.');
  }
  if (!Array.isArray(parsed)) {
    throw new ClarityApiError(res.status, 'Clarity returned an unexpected payload (expected an array of metrics).');
  }

  return mapInsights(parsed as ClarityMetricEntry[], numOfDays);
}
