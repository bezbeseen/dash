/**
 * Google's REST APIs answer API-level failures with a JSON error envelope. A `text/html` body is
 * not an API error at all: it comes from Google's HTTP frontend when the URL matched no endpoint,
 * so it means the request was built wrong rather than that access was denied.
 */

const SNIPPET_MAX_CHARS = 220;

export type GbpResponseBodyKind = 'json' | 'html' | 'text' | 'empty';

export type GbpFailureReason =
  | 'endpoint'
  | 'bad_request'
  | 'scope'
  | 'api_disabled'
  | 'quota'
  | 'permission'
  | 'not_found'
  | 'unknown';

type GoogleErrorEnvelope = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ reason?: string }>;
  };
};

export type GoogleErrorFields = { message: string; status: string; reasons: string[] };

/** These APIs pass the token in a header, but tokeninfo takes one in the query string. */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:access_token|key|token)=)[^&]*/gi, '$1REDACTED');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripMarkup(body: string): string {
  return collapseWhitespace(
    body
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  );
}

function capSnippet(text: string): string {
  return text.length > SNIPPET_MAX_CHARS ? `${text.slice(0, SNIPPET_MAX_CHARS - 1)}…` : text;
}

export function classifyResponseBody(contentType: string | null, body: string): GbpResponseBodyKind {
  const trimmed = body.trim();
  if (!trimmed) return 'empty';
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (type.includes('html') || trimmed.startsWith('<')) return 'html';
  return 'text';
}

/** Legible, hard-capped remnant of a response body, safe to show a user. */
export function summarizeResponseBody(
  contentType: string | null,
  body: string,
): { kind: GbpResponseBodyKind; snippet: string } {
  const kind = classifyResponseBody(contentType, body);
  if (kind === 'empty') return { kind, snippet: '' };
  return { kind, snippet: capSnippet(kind === 'html' ? stripMarkup(body) : collapseWhitespace(body)) };
}

export function parseGoogleErrorFields(body: string): GoogleErrorFields | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const error = (parsed as GoogleErrorEnvelope).error;
  if (!error) return null;
  return {
    message: typeof error.message === 'string' ? error.message : '',
    status: typeof error.status === 'string' ? error.status : '',
    reasons: (error.details ?? [])
      .map((detail) => detail.reason)
      .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0),
  };
}

export function diagnoseGbpFailure(
  httpStatus: number,
  bodyKind: GbpResponseBodyKind,
  google: GoogleErrorFields | null,
): GbpFailureReason {
  if (bodyKind === 'html') return 'endpoint';

  const signals = [google?.status ?? '', google?.reasons.join(' ') ?? '', google?.message ?? '']
    .join(' ')
    .toUpperCase();

  // Scope, disabled-API, and quota all arrive as 403, so they are checked before the status map.
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|INSUFFICIENT AUTHENTICATION SCOPES|INSUFFICIENT_SCOPE/.test(signals)) {
    return 'scope';
  }
  if (/SERVICE_DISABLED|HAS NOT BEEN USED IN PROJECT|API IS DISABLED/.test(signals)) return 'api_disabled';
  if (/RESOURCE_EXHAUSTED|RATE_?LIMIT_?EXCEEDED|QUOTA/.test(signals) || httpStatus === 429) return 'quota';

  if (httpStatus === 400) return 'bad_request';
  if (httpStatus === 404) return 'not_found';
  if (httpStatus === 401 || httpStatus === 403) return 'permission';
  return 'unknown';
}

export function describeGbpFailure(
  label: string,
  httpStatus: number,
  bodyKind: GbpResponseBodyKind,
  reason: GbpFailureReason,
  google: GoogleErrorFields | null,
  snippet: string,
): string {
  if (reason === 'endpoint') {
    const detail = snippet ? ` Google said: ${snippet}` : '';
    return `${label}: Google returned an HTML error page (HTTP ${httpStatus}) instead of an API response, which means the request URL did not match any endpoint. This is a Dash bug, not a permissions or approval problem.${detail}`;
  }

  if (bodyKind !== 'json') {
    const detail = snippet ? ` Body: ${snippet}` : ' The response body was empty.';
    return `${label}: HTTP ${httpStatus} with a non-JSON response.${detail}`;
  }

  const parts = [`HTTP ${httpStatus}`];
  if (google?.status) parts.push(google.status);
  if (google?.reasons.length) parts.push(google.reasons.join(', '));
  const detail = google?.message ? ` ${google.message}` : ` ${snippet}`;
  return capSnippet(`${label}: ${parts.join(' ')}.${detail}`.trim());
}

export class GbpApiError extends Error {
  readonly label: string;
  readonly httpStatus: number;
  readonly url: string;
  readonly bodyKind: GbpResponseBodyKind;
  readonly reason: GbpFailureReason;
  readonly snippet: string;

  constructor(init: {
    label: string;
    httpStatus: number;
    url: string;
    bodyKind: GbpResponseBodyKind;
    reason: GbpFailureReason;
    snippet: string;
    message: string;
  }) {
    super(init.message);
    this.name = 'GbpApiError';
    this.label = init.label;
    this.httpStatus = init.httpStatus;
    this.url = init.url;
    this.bodyKind = init.bodyKind;
    this.reason = init.reason;
    this.snippet = init.snippet;
  }
}

export function buildGbpApiError(
  label: string,
  url: string,
  httpStatus: number,
  contentType: string | null,
  body: string,
): GbpApiError {
  const { kind, snippet } = summarizeResponseBody(contentType, body);
  const google = kind === 'json' ? parseGoogleErrorFields(body) : null;
  const reason = diagnoseGbpFailure(httpStatus, kind, google);
  return new GbpApiError({
    label,
    httpStatus,
    url: redactUrl(url),
    bodyKind: kind,
    reason,
    snippet,
    message: describeGbpFailure(label, httpStatus, kind, reason, google, snippet),
  });
}
