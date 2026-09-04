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
   * The live API sends `distinctUserCount`; the published docs sample spells it `distantUserCount`.
   * Both are accepted, real spelling first. NOT the visitors behind `totalSessionCount`: that same
   * docs sample pairs 189,733 users with 9,554 sessions in one row, so it is not bot-filtered the
   * same way and is not comparable to a session count.
   */
  distinctUsers: number | null;
  /** `pagesPerSessionPercentage` is a plain ratio despite the name (live: 1.409, docs: 1.0931). */
  pagesPerSession: number | null;
};

/** One row of a Clarity dimension breakdown, already merged and sorted by {@link count} descending. */
export type ClarityBreakdownRow = {
  key: string;
  label: string;
  /** Absolute URL for the URL-keyed metrics, so a label can link out; null for plain dimensions. */
  href: string | null;
  count: number;
};

/**
 * Clarity returns every one of these in the same response as the headline numbers, at no extra
 * quota cost. All seven are mapped even though the panel renders a subset, so the raw diagnostic
 * and the typed view agree and the choice of what to show stays a UI decision.
 */
export type ClarityBreakdowns = {
  popularPages: ClarityBreakdownRow[];
  referrers: ClarityBreakdownRow[];
  pageTitles: ClarityBreakdownRow[];
  browsers: ClarityBreakdownRow[];
  operatingSystems: ClarityBreakdownRow[];
  devices: ClarityBreakdownRow[];
  countries: ClarityBreakdownRow[];
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
  /** Percentage 0-100 (live payload sends 36 for 36%), or null when Clarity omitted the metric. */
  averageScrollDepth: number | null;
  /**
   * Seconds PER SESSION, not a total for the window. Microsoft's own worked example reports 615
   * Chrome sessions against a `totalTime` of 252s while Edge shows 384s on 123 sessions, and Safari
   * — too small to reach the top-four traffic table — posts the highest figure of all at 445s. That
   * ordering is only possible if these are per-session averages.
   * https://learn.microsoft.com/en-us/clarity/third-party-integrations/clarity-mcp-server
   */
  averageTotalTimeSeconds: number | null;
  /** Seconds per session of actual interaction; the remainder of the session was idle. */
  averageActiveTimeSeconds: number | null;
  signals: ClaritySignal[];
  breakdowns: ClarityBreakdowns;
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
  const byLowerKey = lowerKeyIndex(row);
  for (const key of keys) {
    const actual = byLowerKey.get(key.toLowerCase());
    if (actual === undefined) continue;
    const parsed = toNumber(row[actual]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function lowerKeyIndex(row: ClarityInfoRow): Map<string, string> {
  const index = new Map<string, string>();
  for (const key of Object.keys(row)) {
    const lower = key.toLowerCase();
    if (!index.has(lower)) index.set(lower, key);
  }
  return index;
}

/** Same whole-key discipline as {@link pickNumber}. Blank and non-string values count as absent. */
function pickString(row: ClarityInfoRow, keys: readonly string[]): string | null {
  const byLowerKey = lowerKeyIndex(row);
  for (const key of keys) {
    const actual = byLowerKey.get(key.toLowerCase());
    if (actual === undefined) continue;
    const value = row[actual];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed !== '') return trimmed;
  }
  return null;
}

/** Clarity reports a missing referrer as a null name, which means the visitor arrived directly. */
export const DIRECT_REFERRER_LABEL = 'Direct';
const UNKNOWN_LABEL = '(not set)';

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Clarity lists `https://site/` and `https://www.site/` as separate rows. At single-digit session
 * counts that split understates the busiest page and reorders the list, so equivalent hosts and
 * trailing slashes collapse into one row. The path is the label because the host is the same site
 * on every row, matching how the GA4 table above reports pages.
 */
function normalizePageUrl(raw: string): Omit<ClarityBreakdownRow, 'count'> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { key: raw.toLowerCase(), label: raw, href: null };
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return { key: `${stripWww(url.hostname)}${path}${url.search}`, label: `${path}${url.search}`, href: url.toString() };
}

/** Referrers are only useful at host granularity; the landing path varies per visit and is noise. */
function normalizeReferrer(raw: string | null): Omit<ClarityBreakdownRow, 'count'> {
  if (raw === null) return { key: 'direct', label: DIRECT_REFERRER_LABEL, href: null };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { key: raw.toLowerCase(), label: raw, href: null };
  }
  const host = stripWww(url.hostname);
  return { key: host, label: host, href: `${url.protocol}//${url.host}/` };
}

function mergeBreakdownRows(rows: readonly ClarityBreakdownRow[]): ClarityBreakdownRow[] {
  const byKey = new Map<string, ClarityBreakdownRow>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, { ...row });
      continue;
    }
    existing.count += row.count;
    existing.href = existing.href ?? row.href;
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

/** `PopularPages` is keyed by `url`/`visitsCount`; every other breakdown uses `name`/`sessionsCount`. */
function readBreakdown(
  entries: ClarityMetricEntry[],
  metricName: string,
  kind: 'plain' | 'page' | 'referrer',
): ClarityBreakdownRow[] {
  const rows: ClarityBreakdownRow[] = [];
  for (const row of metricRows(entries, metricName)) {
    const count = pickNumber(row, kind === 'page' ? ['visitsCount'] : ['sessionsCount']);
    if (count === null) continue;
    const raw = pickString(row, kind === 'page' ? ['url'] : ['name']);
    if (kind === 'referrer') {
      rows.push({ ...normalizeReferrer(raw), count });
    } else if (kind === 'page') {
      if (raw === null) continue;
      rows.push({ ...normalizePageUrl(raw), count });
    } else {
      const label = raw ?? UNKNOWN_LABEL;
      rows.push({ key: label.toLowerCase(), label, href: null, count });
    }
  }
  return mergeBreakdownRows(rows);
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

/** The "Active Time %" Clarity shows in its own tooling: active seconds over total seconds. */
export function activeTimeSharePercentage(insights: ClarityInsights): number | null {
  const { averageActiveTimeSeconds: active, averageTotalTimeSeconds: total } = insights;
  if (active === null || total === null || total <= 0) return null;
  return (active / total) * 100;
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
    distinctUsers: pickNumber(traffic, ['distinctUserCount', 'distantUserCount']),
    pagesPerSession: pickNumber(traffic, ['pagesPerSessionPercentage', 'pagesPerSession']),
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
    averageTotalTimeSeconds: pickNumber(engagement, ['totalTime', 'totalEngagementTime']),
    averageActiveTimeSeconds: pickNumber(engagement, ['activeTime', 'activeTimeSpent']),
    signals,
    breakdowns: {
      popularPages: readBreakdown(entries, 'PopularPages', 'page'),
      referrers: readBreakdown(entries, 'ReferrerUrl', 'referrer'),
      pageTitles: readBreakdown(entries, 'PageTitle', 'plain'),
      browsers: readBreakdown(entries, 'Browser', 'plain'),
      operatingSystems: readBreakdown(entries, 'OS', 'plain'),
      devices: readBreakdown(entries, 'Device', 'plain'),
      countries: readBreakdown(entries, 'Country', 'plain'),
    },
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
