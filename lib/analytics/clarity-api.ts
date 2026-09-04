const CLARITY_INSIGHTS_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

type ClarityInfoRow = Record<string, unknown>;
type ClarityMetricEntry = { metricName?: string; information?: ClarityInfoRow[] };

export type ClarityTraffic = {
  /**
   * Clarity's `totalSessionCount`. Bot detection is on by default and Clarity "excludes it from
   * total session count and analytics", so this is human traffic only and can legitimately be
   * SMALLER than {@link botSessions}.
   * https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup
   */
  humanSessions: number | null;
  /** Sessions Clarity classified as bots and removed from `totalSessionCount`. */
  botSessions: number | null;
  /**
   * Clarity's `distantUserCount` (spelled that way in the docs). NOT the visitors behind
   * `totalSessionCount`: Microsoft's own sample response reports 189,733 against 9,554 sessions in
   * the same row, so it is not bot-filtered the same way and is not comparable to a session count.
   */
  distinctUsers: number | null;
  /** `PagesPerSessionPercentage` is a plain ratio despite the name (docs sample: 1.0931, 2.2609). */
  pagesPerSession: number | null;
};

/** Frustration signal: the share of sessions Clarity flagged, plus the raw occurrence count. */
export type ClaritySignal = {
  key: string;
  label: string;
  /** Percentage 0-100 of {@link sessionScope}, or null when Clarity omitted the metric. */
  sessionPercentage: number | null;
  /** Clarity's `subTotal`: how many times the behaviour happened, not how many sessions. */
  occurrences: number | null;
  /** Clarity's `sessionsCount`, the denominator it used for {@link sessionPercentage}. */
  sessionScope: number | null;
};

export type ClarityInsights = {
  numOfDays: number;
  traffic: ClarityTraffic;
  /** Percentage 0-100, or null when Clarity omitted the metric. */
  averageScrollDepth: number | null;
  totalEngagementSeconds: number | null;
  activeEngagementSeconds: number | null;
  signals: ClaritySignal[];
  /** Non-fatal integrity notes so the panel can caveat instead of quietly rendering nonsense. */
  warnings: string[];
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
 * (`totalSessionCount` next to `PagesPerSessionPercentage`), so read case-insensitively.
 *
 * Matching is whole-key only, never substring or prefix: sibling fields share long tokens
 * (`totalSessionCount`/`totalBotSessionCount`, `sessionsWithMetricPercentage`/
 * `sessionsWithoutMetricPercentage`) and a loose match would silently read the wrong number.
 * Aliases must stay within one metric — `sessionsCount` belongs to the frustration rows and must
 * never stand in for a Traffic session count.
 */
export function pickNumber(row: ClarityInfoRow | undefined, keys: readonly string[]): number | null {
  if (!row) return null;
  const byLowerKey = new Map<string, string>();
  for (const key of Object.keys(row)) {
    const lower = key.toLowerCase();
    if (!byLowerKey.has(lower)) byLowerKey.set(lower, key);
  }
  for (const key of keys) {
    const actual = byLowerKey.get(key.toLowerCase());
    if (actual === undefined) continue;
    const parsed = toNumber(row[actual]);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Requests carry no dimensions, so each metric should come back as a single project-wide row. */
function metricRows(entries: ClarityMetricEntry[], metricName: string): ClarityInfoRow[] {
  const entry = entries.find(
    (candidate) => candidate.metricName?.toLowerCase() === metricName.toLowerCase(),
  );
  return Array.isArray(entry?.information) ? entry.information : [];
}

/** Total sessions Clarity actually recorded, before bot filtering. */
export function recordedSessions(traffic: ClarityTraffic): number | null {
  if (traffic.humanSessions === null && traffic.botSessions === null) return null;
  return (traffic.humanSessions ?? 0) + (traffic.botSessions ?? 0);
}

export function botSharePercentage(traffic: ClarityTraffic): number | null {
  const total = recordedSessions(traffic);
  if (total === null || total <= 0 || traffic.botSessions === null) return null;
  return (traffic.botSessions / total) * 100;
}

/** Clarity reports a percentage, not a count, so the session figure has to be reconstructed. */
export function signalAffectedSessions(signal: ClaritySignal): number | null {
  if (signal.sessionPercentage === null || signal.sessionScope === null) return null;
  return Math.round((signal.sessionPercentage / 100) * signal.sessionScope);
}

export function mapClarityInsights(entries: ClarityMetricEntry[], numOfDays: number): ClarityInsights {
  const trafficRows = metricRows(entries, 'Traffic');
  const traffic = trafficRows[0];
  const engagement = metricRows(entries, 'EngagementTime')[0];
  const scroll = metricRows(entries, 'ScrollDepth')[0];
  const warnings: string[] = [];

  if (trafficRows.length > 1) {
    warnings.push(
      `Clarity returned ${trafficRows.length} Traffic rows for a request with no dimensions; only the first is shown.`,
    );
  }

  const mappedTraffic: ClarityTraffic = {
    humanSessions: pickNumber(traffic, ['totalSessionCount']),
    botSessions: pickNumber(traffic, ['totalBotSessionCount']),
    distinctUsers: pickNumber(traffic, ['distantUserCount', 'distinctUserCount']),
    pagesPerSession: pickNumber(traffic, ['PagesPerSessionPercentage', 'pagesPerSession']),
  };

  const totalSessions = recordedSessions(mappedTraffic);
  if (
    mappedTraffic.distinctUsers !== null &&
    totalSessions !== null &&
    mappedTraffic.distinctUsers > totalSessions
  ) {
    warnings.push(
      `Clarity reported ${mappedTraffic.distinctUsers} distinct users against ${totalSessions} recorded sessions, which cannot both be per-visitor counts. The user figure is shown unlabelled as a visitor total.`,
    );
  }

  const signals = SIGNAL_METRICS.map(({ metricName, label }) => {
    const row = metricRows(entries, metricName)[0];
    return {
      key: metricName,
      label,
      sessionPercentage: pickNumber(row, ['sessionsWithMetricPercentage']),
      occurrences: pickNumber(row, ['subTotal']),
      sessionScope: pickNumber(row, ['sessionsCount']),
    };
  });

  const mismatchedScope = signals.find(
    (signal) =>
      signal.sessionScope !== null &&
      mappedTraffic.humanSessions !== null &&
      signal.sessionScope !== mappedTraffic.humanSessions,
  );
  if (mismatchedScope) {
    warnings.push(
      `Frustration percentages are measured against ${mismatchedScope.sessionScope} sessions but Traffic reported ${mappedTraffic.humanSessions}; the two metrics cover different session sets.`,
    );
  }

  return {
    numOfDays,
    traffic: mappedTraffic,
    averageScrollDepth: pickNumber(scroll, ['averageScrollDepth', 'scrollDepth']),
    totalEngagementSeconds: pickNumber(engagement, ['totalTime', 'totalEngagementTime']),
    activeEngagementSeconds: pickNumber(engagement, ['activeTime', 'activeTimeSpent']),
    signals,
    warnings,
  };
}

/** The mapped view plus the untouched payload, so a diagnostic can show real field names. */
export type ClarityFetchResult = { insights: ClarityInsights; raw: unknown };

export async function fetchClarityInsights(token: string, numOfDays: number): Promise<ClarityFetchResult> {
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

  return { insights: mapClarityInsights(parsed as ClarityMetricEntry[], numOfDays), raw: parsed };
}
