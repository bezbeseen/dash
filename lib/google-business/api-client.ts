import { buildGbpApiError, GbpApiError, redactUrl } from '@/lib/google-business/api-errors';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Single entry point for GBP reads so every failure becomes a `GbpApiError` with a legible
 * message, instead of a raw response body pasted into a string.
 */
export async function gbpFetchJson<T>(label: string, url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await res.text();
  const contentType = res.headers.get('content-type');

  if (!res.ok) {
    throw buildGbpApiError(label, url, res.status, contentType, body);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    // A 200 that is not JSON still means the URL did not reach the API.
    throw buildGbpApiError(label, url, res.status, contentType, body);
  }
}

export function gbpErrorUrl(error: unknown): string | null {
  return error instanceof GbpApiError ? redactUrl(error.url) : null;
}
