import { prisma } from '@/lib/db/prisma';
import { fetchGrantedScopes, GBP_BUSINESS_MANAGE_SCOPE } from '@/lib/google-business/oauth';
import { fetchGbpLocationsResilient } from '@/lib/google-business/persisted-location-list';
import { fetchGbpMetricTotals, gbpPerformanceLocationPath } from '@/lib/google-business/performance-api';
import { getValidGoogleBusinessAccessToken } from '@/lib/google-business/tokens';

export type GbpAccessProbe = {
  connectedEmail: string | null;
  grantedScopes: string[] | null;
  hasBusinessManageScope: boolean | null;
  accountCount: number | null;
  locationCount: number | null;
  /** `locations/{id}` actually used for Performance API calls. */
  locationPath: string | null;
  locationSource: 'db_fresh' | 'api' | 'db_stale' | null;
  performanceApiOk: boolean | null;
  error: string | null;
};

const EMPTY: GbpAccessProbe = {
  connectedEmail: null,
  grantedScopes: null,
  hasBusinessManageScope: null,
  accountCount: null,
  locationCount: null,
  locationPath: null,
  locationSource: null,
  performanceApiOk: null,
  error: null,
};

export function gbpProbeUnavailable(error: string): GbpAccessProbe {
  return { ...EMPTY, performanceApiOk: false, error };
}

/**
 * End-to-end read check for the GBP pipeline: stored token, granted scopes, location resolution, and
 * one small Performance API call. Distinguishes a stale consent from a project that lacks API quota.
 */
export async function probeGbpPerformanceAccess(): Promise<GbpAccessProbe> {
  const connection = await prisma.googleBusinessConnection.findFirst({
    orderBy: { googleEmail: 'asc' },
    select: { googleEmail: true },
  });
  if (!connection) return EMPTY;

  const probe: GbpAccessProbe = { ...EMPTY, connectedEmail: connection.googleEmail };

  try {
    const token = await getValidGoogleBusinessAccessToken(connection.googleEmail);

    try {
      const scopes = await fetchGrantedScopes(token);
      probe.grantedScopes = scopes;
      probe.hasBusinessManageScope = scopes.includes(GBP_BUSINESS_MANAGE_SCOPE);
    } catch {
      probe.grantedScopes = null;
    }

    const { accountCount, allLocations, source } = await fetchGbpLocationsResilient(connection.googleEmail);
    probe.accountCount = accountCount;
    probe.locationCount = allLocations.length;
    probe.locationSource = source;

    const first = allLocations[0];
    if (!first) {
      probe.error = 'No locations returned for the connected Google account.';
      return probe;
    }
    probe.locationPath = gbpPerformanceLocationPath(first.name);

    await fetchGbpMetricTotals(token, first.name, 7);
    probe.performanceApiOk = true;
    return probe;
  } catch (e) {
    probe.performanceApiOk = false;
    probe.error = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    return probe;
  }
}
