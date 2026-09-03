import {
  fetchGa4Channels,
  fetchGa4Devices,
  fetchGa4Totals,
  fetchGa4TopPages,
  type Ga4NamedCount,
  type Ga4Totals,
} from '@/lib/analytics/ga4-api';
import {
  ga4ReportingConfigured,
  getGa4AccessToken,
  getGa4PropertyId,
  getGa4ServiceAccountEmail,
} from '@/lib/analytics/ga4-config';

export const WEB_ANALYTICS_RANGE_OPTIONS = [7, 28, 90] as const;

const DEFAULT_RANGE_DAYS = 28;

export function normalizeWebAnalyticsRange(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '', 10);
  return WEB_ANALYTICS_RANGE_OPTIONS.includes(parsed as (typeof WEB_ANALYTICS_RANGE_OPTIONS)[number])
    ? parsed
    : DEFAULT_RANGE_DAYS;
}

export type WebAnalyticsPageData =
  | {
      ok: false;
      kind: 'not_configured';
      propertyIdSet: boolean;
      serviceAccountEmail: string | null;
    }
  | { ok: false; kind: 'error'; message: string; serviceAccountEmail: string | null }
  | {
      ok: true;
      rangeDays: number;
      propertyId: string;
      totals: Ga4Totals;
      previousTotals: Ga4Totals;
      topPages: Ga4NamedCount[];
      channels: Ga4NamedCount[];
      devices: Ga4NamedCount[];
    };

/** GA4 traffic for the marketing site, read server-side with the analytics service account. */
export async function loadWebAnalyticsPageData(rangeDays: number): Promise<WebAnalyticsPageData> {
  const serviceAccountEmail = getGa4ServiceAccountEmail();
  const propertyId = getGa4PropertyId();

  if (!ga4ReportingConfigured() || !propertyId) {
    return {
      ok: false,
      kind: 'not_configured',
      propertyIdSet: Boolean(propertyId),
      serviceAccountEmail,
    };
  }

  try {
    const token = await getGa4AccessToken();
    const [totals, previousTotals, topPages, channels, devices] = await Promise.all([
      fetchGa4Totals(token, rangeDays),
      fetchGa4Totals(token, rangeDays, 1),
      fetchGa4TopPages(token, rangeDays),
      fetchGa4Channels(token, rangeDays),
      fetchGa4Devices(token, rangeDays),
    ]);

    return { ok: true, rangeDays, propertyId, totals, previousTotals, topPages, channels, devices };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not load Google Analytics data.';
    return { ok: false, kind: 'error', message, serviceAccountEmail };
  }
}
