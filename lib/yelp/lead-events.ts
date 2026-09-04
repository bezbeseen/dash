/**
 * Parse Get Lead / Get Lead Events JSON into the fields Correspondence needs.
 * Official event shape: https://docs.developer.yelp.com/reference/get-lead-events
 *
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */

export const YELP_BIZ_EVENT_NAME = 'inbound.yelp_biz_event';

export type YelpLeadTextEvent = {
  eventId: string;
  timeCreated: string;
  userType: string;
  userDisplayName: string | null;
  text: string;
  channel: string | null;
  cursor: string | null;
};

export type YelpLeadRecord = {
  id: string;
  businessId: string | null;
  conversationId: string | null;
  temporaryEmail: string | null;
  raw: Record<string, unknown>;
};

export function asJsonRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function parseYelpLeadRecord(raw: Record<string, unknown>): YelpLeadRecord | null {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  const businessId =
    typeof raw.business_id === 'string' && raw.business_id.trim() ? raw.business_id.trim() : null;
  const conversationId =
    typeof raw.conversation_id === 'string' && raw.conversation_id.trim()
      ? raw.conversation_id.trim()
      : null;
  const temporaryEmail =
    typeof raw.temporary_email_address === 'string' && raw.temporary_email_address.trim()
      ? raw.temporary_email_address.trim()
      : null;
  return { id, businessId, conversationId, temporaryEmail, raw };
}

function eventCursor(ev: Record<string, unknown>): string | null {
  return typeof ev.cursor === 'string' && ev.cursor.trim() ? ev.cursor.trim() : null;
}

/** Oldest event in a Get Lead Events page (Yelp returns newest last). */
export function oldestEventCursor(events: unknown[]): string | null {
  for (const raw of events) {
    const ev = asJsonRecord(raw);
    if (!ev) continue;
    const cursor = eventCursor(ev);
    if (cursor) return cursor;
  }
  return null;
}

export function parseYelpLeadEventsPayload(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const o = asJsonRecord(parsed);
  const ev = o?.events;
  return Array.isArray(ev) ? ev : [];
}

export function parseYelpLeadTextEvent(raw: unknown): YelpLeadTextEvent | null {
  const ev = asJsonRecord(raw);
  if (!ev) return null;
  if (ev.event_type !== 'TEXT') return null;
  const eventId = typeof ev.id === 'string' && ev.id.trim() ? ev.id.trim() : null;
  if (!eventId) return null;
  const content = asJsonRecord(ev.event_content);
  const textRaw = content?.text ?? content?.fallback_text;
  const text = typeof textRaw === 'string' ? textRaw.trim() : '';
  if (!text) return null;
  const timeCreated =
    typeof ev.time_created === 'string' && ev.time_created.trim() ? ev.time_created.trim() : '';
  const userType =
    typeof ev.user_type === 'string' && ev.user_type.trim() ? ev.user_type.trim() : 'UNKNOWN';
  const userDisplayName =
    typeof ev.user_display_name === 'string' && ev.user_display_name.trim()
      ? ev.user_display_name.trim()
      : null;
  const channel = typeof ev.channel === 'string' && ev.channel.trim() ? ev.channel.trim() : null;
  return {
    eventId,
    timeCreated,
    userType,
    userDisplayName,
    text,
    channel,
    cursor: eventCursor(ev),
  };
}

export function parseYelpLeadTextEvents(events: unknown[]): YelpLeadTextEvent[] {
  const out: YelpLeadTextEvent[] = [];
  const seen = new Set<string>();
  for (const raw of events) {
    const parsed = parseYelpLeadTextEvent(raw);
    if (!parsed || seen.has(parsed.eventId)) continue;
    seen.add(parsed.eventId);
    out.push(parsed);
  }
  return out;
}

export function yelpBizSideFromUserType(userType: string): 'shop' | 'customer' | 'unknown' {
  if (userType === 'BIZ') return 'shop';
  if (userType === 'CONSUMER') return 'customer';
  return 'unknown';
}

export function yelpBizFromLabel(input: {
  userType: string;
  userDisplayName: string | null;
}): string {
  const name = input.userDisplayName?.trim();
  if (name) return name;
  const side = yelpBizSideFromUserType(input.userType);
  if (side === 'shop') return 'Shop';
  if (side === 'customer') return 'Customer';
  return 'Yelp';
}
