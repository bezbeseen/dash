import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { ClarityApiError, fetchClarityInsights, type ClarityInsights } from '@/lib/analytics/clarity-api';
import {
  CLARITY_MAX_LOOKBACK_DAYS,
  clarityInsightsConfigured,
  getClarityApiToken,
} from '@/lib/analytics/clarity-config';

/**
 * Clarity allows 10 requests per project per day. Refreshing every 6 hours costs at most 4,
 * leaving headroom for preview deployments and manual curl calls that share the same quota.
 */
const CLARITY_CACHE_TTL_SECONDS = 6 * 60 * 60;

export const CLARITY_CACHE_TAG = 'clarity-insights';

export type ClarityInsightsSnapshot =
  | { ok: false; kind: 'quota_exceeded'; fetchedAt: number }
  | { ok: false; kind: 'auth_failed'; message: string; fetchedAt: number }
  | { ok: false; kind: 'error'; message: string; fetchedAt: number }
  | { ok: true; insights: ClarityInsights; fetchedAt: number };

export type ClarityInsightsData = { ok: false; kind: 'not_configured' } | ClarityInsightsSnapshot;

/**
 * Failures are returned rather than thrown so `unstable_cache` stores them too: a bad token or an
 * exhausted quota must not re-hit Clarity on every page view.
 */
async function fetchClaritySnapshot(token: string): Promise<ClarityInsightsSnapshot> {
  const fetchedAt = Date.now();
  try {
    const insights = await fetchClarityInsights(token, CLARITY_MAX_LOOKBACK_DAYS);
    return { ok: true, insights, fetchedAt };
  } catch (e) {
    if (e instanceof ClarityApiError) {
      if (e.status === 429) return { ok: false, kind: 'quota_exceeded', fetchedAt };
      const message = `Clarity ${e.status}: ${e.message}`;
      if (e.status === 401 || e.status === 403) return { ok: false, kind: 'auth_failed', message, fetchedAt };
      return { ok: false, kind: 'error', message, fetchedAt };
    }
    return {
      ok: false,
      kind: 'error',
      message: e instanceof Error ? e.message : 'Could not load Microsoft Clarity data.',
      fetchedAt,
    };
  }
}

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

/** Project-wide Clarity behaviour signals for the last {@link CLARITY_MAX_LOOKBACK_DAYS} days. */
export async function loadClarityInsightsData(): Promise<ClarityInsightsData> {
  const token = getClarityApiToken();
  if (!token || !clarityInsightsConfigured()) {
    return { ok: false, kind: 'not_configured' };
  }

  // Fingerprint in the cache key so rotating the token retries immediately instead of serving a
  // cached auth failure for the rest of the window.
  const cached = unstable_cache(
    () => fetchClaritySnapshot(token),
    ['clarity-live-insights', tokenFingerprint(token)],
    { revalidate: CLARITY_CACHE_TTL_SECONDS, tags: [CLARITY_CACHE_TAG] },
  );

  return cached();
}
