/**
 * Clarity's Data Export API allows 10 requests per project per day and only exposes the
 * previous 1-3 days, so every caller must go through the cached loader.
 * https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
 */
export const CLARITY_MAX_LOOKBACK_DAYS = 3;
export const CLARITY_DAILY_REQUEST_LIMIT = 10;

const CLARITY_PROJECT_BASE = 'https://clarity.microsoft.com/projects/view';
const CLARITY_HOME = 'https://clarity.microsoft.com/';

/** Server-only JWT from Clarity → Settings → Data Export → Generate new API token. */
export function getClarityApiToken(): string | null {
  const raw = process.env.CLARITY_API_TOKEN?.trim();
  if (!raw || raw === 'replace-me') return null;
  return raw;
}

/** Shared with the browser tag; also identifies the project in Clarity deep links. */
export function getClarityProjectId(): string | null {
  const raw = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
  if (!raw || raw === 'replace-me') return null;
  return raw;
}

export function clarityInsightsConfigured(): boolean {
  return Boolean(getClarityApiToken());
}

export type ClarityLinks = {
  dashboard: string;
  heatmaps: string;
  recordings: string;
  dataExportSettings: string;
};

/** Heatmaps and session recordings have no API, so the UI always links into Clarity itself. */
export function getClarityLinks(): ClarityLinks {
  const projectId = getClarityProjectId();
  if (!projectId) {
    return {
      dashboard: CLARITY_HOME,
      heatmaps: CLARITY_HOME,
      recordings: CLARITY_HOME,
      dataExportSettings: CLARITY_HOME,
    };
  }
  const base = `${CLARITY_PROJECT_BASE}/${encodeURIComponent(projectId)}`;
  return {
    dashboard: `${base}/dashboard`,
    heatmaps: `${base}/heatmaps`,
    recordings: `${base}/impressions`,
    dataExportSettings: `${base}/settings`,
  };
}
