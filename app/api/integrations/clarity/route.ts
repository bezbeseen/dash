import { NextRequest, NextResponse } from 'next/server';
import {
  CLARITY_DAILY_REQUEST_LIMIT,
  CLARITY_MAX_LOOKBACK_DAYS,
  clarityInsightsConfigured,
  getClarityProjectId,
} from '@/lib/analytics/clarity-config';
import {
  fetchClarityInsightsUncached,
  loadClarityInsightsData,
  type ClarityInsightsData,
} from '@/lib/domain/load-clarity-insights';

export const dynamic = 'force-dynamic';

/**
 * Clarity documents metric names but not field names, so list the keys it actually sent. This is
 * the fastest way to spot a renamed or newly added field without reading the whole payload.
 */
function observedFieldNames(raw: unknown): Record<string, string[]> | null {
  if (!Array.isArray(raw)) return null;
  const byMetric: Record<string, string[]> = {};
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { metricName, information } = entry as { metricName?: unknown; information?: unknown };
    if (typeof metricName !== 'string' || !Array.isArray(information)) continue;
    const keys = new Set<string>();
    for (const row of information) {
      if (typeof row !== 'object' || row === null) continue;
      for (const key of Object.keys(row)) keys.add(key);
    }
    byMetric[metricName] = [...keys];
  }
  return byMetric;
}

/**
 * Read-only Clarity diagnostic behind the normal dashboard session (see middleware.ts — this path
 * is deliberately absent from PUBLIC_API_PREFIXES).
 *
 * Default and `?raw=1` both read the 6-hour cached snapshot and cost no Clarity quota, because the
 * loader stores the unmapped payload next to the mapped one. Only `?fresh=1` calls Clarity, and it
 * spends one of the CLARITY_DAILY_REQUEST_LIMIT requests the whole project shares that day.
 */
export async function GET(req: NextRequest) {
  const wantsRaw = req.nextUrl.searchParams.get('raw') === '1';
  const wantsFresh = req.nextUrl.searchParams.get('fresh') === '1';

  const data: ClarityInsightsData = wantsFresh
    ? await fetchClarityInsightsUncached()
    : await loadClarityInsightsData();

  const meta = {
    configured: clarityInsightsConfigured(),
    projectId: getClarityProjectId(),
    numOfDays: CLARITY_MAX_LOOKBACK_DAYS,
    source: wantsFresh ? ('live' as const) : ('cache' as const),
    clarityRequestsSpent: wantsFresh ? 1 : 0,
    usage: {
      cached: 'GET ?raw=1 — full unmapped Clarity JSON from the cached snapshot, no quota cost.',
      live: `GET ?fresh=1&raw=1 — bypasses the cache and spends 1 of ${CLARITY_DAILY_REQUEST_LIMIT} Clarity requests for today.`,
    },
  };

  if (!data.ok) {
    return NextResponse.json({ ok: false, ...meta, kind: data.kind, ...('message' in data ? { message: data.message } : {}) });
  }

  return NextResponse.json({
    ok: true,
    ...meta,
    fetchedAt: new Date(data.fetchedAt).toISOString(),
    mapped: data.insights,
    observedFieldNames: observedFieldNames(data.raw),
    ...(wantsRaw ? { raw: data.raw } : { rawHint: 'Add ?raw=1 for the untouched Clarity payload.' }),
  });
}
