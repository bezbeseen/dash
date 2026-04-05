import { prisma } from '@/lib/db/prisma';
import { getCachedGbpLocationList } from '@/lib/google-business/cached-location-list';
import {
  fetchGbpLocationMetricTotals,
  GBP_DAILY_METRICS,
  GBP_METRIC_LABELS,
} from '@/lib/google-business/performance-api';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

const RANGE_DAYS = 30;
const MAX_GBP = 3;

export type GbpMetricsLocationOption = { name: string; title: string };

export type GbpMetricsPageData =
  | { ok: false; kind: 'no_connection' }
  | { ok: false; kind: 'error'; message: string }
  | {
      ok: true;
      googleEmail: string;
      rangeDays: number;
      selectedIndex: number;
      location: GbpMetricsLocationOption;
      rows: { metric: string; label: string; total: number }[];
      allLocations: GbpMetricsLocationOption[];
    };

export async function loadGbpMetricsPageData(locationIndex: number): Promise<GbpMetricsPageData> {
  const connections = await prisma.googleBusinessConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    take: MAX_GBP,
  });
  if (connections.length === 0) {
    return { ok: false, kind: 'no_connection' };
  }

  try {
    const email = connections[0].googleEmail;
    const { accountCount, allLocations } = await getCachedGbpLocationList(email);
    if (accountCount === 0) {
      return { ok: false, kind: 'error', message: 'No Google Business accounts returned for this login.' };
    }
    if (allLocations.length === 0) {
      return { ok: false, kind: 'error', message: 'No locations found for the first Business account.' };
    }

    const token = await getValidGoogleBusinessAccessToken(email);

    const safe = Number.isFinite(locationIndex) && locationIndex >= 0 ? locationIndex : 0;
    const idx = Math.min(Math.max(0, safe), allLocations.length - 1);
    const location = allLocations[idx];

    const totals = await fetchGbpLocationMetricTotals(token, location.name, GBP_DAILY_METRICS, RANGE_DAYS);
    const rows = totals.map(({ metric, total }) => ({
      metric,
      label: GBP_METRIC_LABELS[metric] ?? metric,
      total,
    }));

    return {
      ok: true,
      googleEmail: email,
      rangeDays: RANGE_DAYS,
      selectedIndex: idx,
      location,
      rows,
      allLocations,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load Google Business Profile metrics.';
    return { ok: false, kind: 'error', message };
  }
}
