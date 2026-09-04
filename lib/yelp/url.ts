/**
 * Safe construction of the biz.yelp.com links Dash stores on tickets.
 *
 * Yelp's lead notification emails link to one-click action endpoints such as
 * `/messaging/mark_as_replied_autosubmit/<conversation-id>`. Opening one from a Dash
 * ticket, in a browser already signed in to biz.yelp.com, silently tells Yelp the shop
 * replied: it inflates the response rate Yelp ranks on and drops a live lead out of the
 * "needs a reply" state. Nothing on a ticket may link to one of these.
 *
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */

/** The business owner's message inbox. Requires a login, performs no action. */
export const YELP_BIZ_INBOX_URL = 'https://biz.yelp.com/messaging';

/** Yelp endpoints that change lead state on GET. */
const DESTRUCTIVE_URL_MARKERS = [
  'mark_as_replied',
  'autosubmit',
  'reply_type=',
  'already_replied',
  'not_interested',
  'report_conversation',
  'one_click',
  'unsubscribe',
];

/** `ytl_*` looks like a single-use action token; `utm_*` is campaign noise. */
const TRACKING_PARAM_PREFIXES = ['utm_', 'ytl_'];

export function isDestructiveYelpUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return DESTRUCTIVE_URL_MARKERS.some((marker) => lower.includes(marker));
}

function stripTrackingParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      url.searchParams.delete(key);
    }
  }
}

/**
 * Returns a link that is safe to store and click, or null when the URL performs an action.
 * Callers must treat null as "no link", never as "store the original".
 */
export function safeYelpUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/[)\]}>,.;:!'"]+$/, '');
  if (!trimmed) return null;
  if (isDestructiveYelpUrl(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    stripTrackingParams(url);
    return url.toString().replace(/\?$/, '');
  } catch {
    return null;
  }
}

/**
 * Deep link to one conversation. Yelp documents this form for the Leads API and notes it
 * will be superseded by Leads Center; it needs the business id, which lead notification
 * emails do not carry.
 */
export function buildYelpBizThreadUrl(businessId: string, conversationId: string): string {
  return `https://biz.yelp.com/messaging/${encodeURIComponent(businessId)}/thread/${encodeURIComponent(conversationId)}`;
}

/** Replaces any state-changing Yelp link inside free text so it cannot be clicked. */
export function redactDestructiveYelpUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, (match) =>
    isDestructiveYelpUrl(match) ? '[yelp action link removed]' : match,
  );
}
