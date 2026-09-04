import { oldestEventCursor, parseYelpLeadEventsPayload } from '@/lib/yelp/lead-events';
import { YELP_LEADS_DENIED_MESSAGE } from '@/lib/yelp/lead-ids';

export { YELP_LEADS_DENIED_MESSAGE };

const YELP_LEADS_BASE = 'https://api.yelp.com/v3';

/** Yelp documents a max of 20 events per Get Lead Events page. */
export const YELP_LEAD_EVENTS_PAGE_SIZE = 20;
/** Hard cap so a ticket refresh stays inside the serverless budget. */
export const YELP_LEAD_EVENTS_MAX = 100;
const LEAD_IDS_PAGE_SIZE = 20;
const LEAD_IDS_MAX_PAGES = 3;

export class YelpLeadsApiError extends Error {
  readonly status: number;
  readonly operation: string;
  readonly bodySnippet: string;

  constructor(status: number, operation: string, bodySnippet: string) {
    super(`Yelp ${operation} ${status}: ${bodySnippet}`);
    this.name = 'YelpLeadsApiError';
    this.status = status;
    this.operation = operation;
    this.bodySnippet = bodySnippet;
  }

  get isDenied(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export function yelpLeadsAccessTokenConfigured(): boolean {
  return Boolean(process.env.YELP_LEADS_ACCESS_TOKEN?.trim());
}

export function yelpBusinessIdFromEnv(): string | null {
  const t = process.env.YELP_BUSINESS_ID?.trim();
  return t || null;
}

function accessToken(): string {
  const t = process.env.YELP_LEADS_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error('YELP_LEADS_ACCESS_TOKEN is not set');
  }
  return t;
}

async function yelpLeadsGet(pathWithQuery: string, operation: string): Promise<string> {
  const res = await fetch(`${YELP_LEADS_BASE}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new YelpLeadsApiError(res.status, operation, text.slice(0, 800));
  }
  return text;
}

function parseJsonObject(text: string, operation: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    throw new Error(`Yelp ${operation}: invalid JSON`);
  }
  throw new Error(`Yelp ${operation}: expected a JSON object`);
}

/** GET /v3/leads/{id} — OAuth Bearer from Leads API (not Fusion API key). */
export async function yelpFetchLead(leadId: string): Promise<Record<string, unknown>> {
  const text = await yelpLeadsGet(`/leads/${encodeURIComponent(leadId)}`, 'Get Lead');
  return parseJsonObject(text, 'Get Lead');
}

export type YelpFetchLeadEventsOpts = {
  limit?: number;
  olderThanCursor?: string;
};

/** GET /v3/leads/{id}/events — returns newest messages last (Yelp docs). */
export async function yelpFetchLeadEvents(
  leadId: string,
  limitOrOpts: number | YelpFetchLeadEventsOpts = YELP_LEAD_EVENTS_PAGE_SIZE,
): Promise<unknown[]> {
  const opts: YelpFetchLeadEventsOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts;
  const limit = Math.min(Math.max(opts.limit ?? YELP_LEAD_EVENTS_PAGE_SIZE, 1), YELP_LEAD_EVENTS_PAGE_SIZE);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.olderThanCursor?.trim()) {
    params.set('older_than_cursor', opts.olderThanCursor.trim());
  }
  const text = await yelpLeadsGet(
    `/leads/${encodeURIComponent(leadId)}/events?${params.toString()}`,
    'Get Lead Events',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Yelp Get Lead Events: invalid JSON');
  }
  return parseYelpLeadEventsPayload(parsed);
}

/** Newest page first, then older pages prepended, up to YELP_LEAD_EVENTS_MAX. */
export async function yelpFetchAllLeadEvents(leadId: string): Promise<unknown[]> {
  const newest = await yelpFetchLeadEvents(leadId, YELP_LEAD_EVENTS_PAGE_SIZE);
  if (newest.length < YELP_LEAD_EVENTS_PAGE_SIZE) return newest;

  const older: unknown[] = [];
  let cursor = oldestEventCursor(newest);
  while (cursor && newest.length + older.length < YELP_LEAD_EVENTS_MAX) {
    const page = await yelpFetchLeadEvents(leadId, {
      limit: YELP_LEAD_EVENTS_PAGE_SIZE,
      olderThanCursor: cursor,
    });
    if (page.length === 0) break;
    older.unshift(...page);
    if (page.length < YELP_LEAD_EVENTS_PAGE_SIZE) break;
    const next = oldestEventCursor(page);
    if (!next || next === cursor) break;
    cursor = next;
  }

  const combined = [...older, ...newest];
  return combined.slice(Math.max(0, combined.length - YELP_LEAD_EVENTS_MAX));
}

export type YelpBusinessLeadIdsPage = {
  leadIds: string[];
  hasMore: boolean;
};

/** GET /v3/businesses/{business_id}/lead_ids */
export async function yelpFetchBusinessLeadIds(
  businessId: string,
  opts?: { afterLeadId?: string; limit?: number },
): Promise<YelpBusinessLeadIdsPage> {
  const limit = Math.min(Math.max(opts?.limit ?? LEAD_IDS_PAGE_SIZE, 1), LEAD_IDS_PAGE_SIZE);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.afterLeadId?.trim()) params.set('after_lead_id', opts.afterLeadId.trim());
  const text = await yelpLeadsGet(
    `/businesses/${encodeURIComponent(businessId)}/lead_ids?${params.toString()}`,
    'Get Lead IDs',
  );
  const parsed = parseJsonObject(text, 'Get Lead IDs');
  const rawIds = parsed.lead_ids;
  const leadIds: string[] = [];
  if (Array.isArray(rawIds)) {
    for (const id of rawIds) {
      if (typeof id === 'string' && id.trim()) leadIds.push(id.trim());
    }
  }
  return { leadIds, hasMore: parsed.has_more === true };
}

/** Scan a few newest lead-id pages (does not fetch each lead). */
export async function yelpListRecentBusinessLeadIds(businessId: string): Promise<string[]> {
  const ids: string[] = [];
  let afterLeadId: string | undefined;
  for (let page = 0; page < LEAD_IDS_MAX_PAGES; page += 1) {
    const result = await yelpFetchBusinessLeadIds(businessId, { afterLeadId });
    ids.push(...result.leadIds);
    if (!result.hasMore || result.leadIds.length === 0) break;
    afterLeadId = result.leadIds[result.leadIds.length - 1];
    if (!afterLeadId) break;
  }
  return [...new Set(ids)];
}
