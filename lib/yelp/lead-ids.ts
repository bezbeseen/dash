/**
 * Job.yelpLeadId from notification emails is `yelp:<conversation-hex>` (the 32-hex in
 * `reply+hex@messaging.yelp.com`). The Leads API Get Lead / events path needs the
 * partner **lead id**, which Get Lead also returns as `id` alongside `conversation_id`.
 * Those two values are not always the same; lookup and fetch have to try both.
 *
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */

export const YELP_LEADS_DENIED_MESSAGE = 'Yelp Leads API denied; replies stay on Yelp Biz';

export function stripYelpLeadIdPrefix(stored: string): string {
  const t = stored.trim();
  return t.startsWith('yelp:') ? t.slice('yelp:'.length) : t;
}

export function withYelpLeadIdPrefix(id: string): string {
  const t = id.trim();
  if (!t) return t;
  return t.startsWith('yelp:') ? t : `yelp:${t}`;
}

export function yelpStoredLeadIdVariants(stored: string | null | undefined): string[] {
  const t = stored?.trim();
  if (!t) return [];
  const bare = stripYelpLeadIdPrefix(t);
  if (!bare) return [t];
  return [...new Set([t, bare, withYelpLeadIdPrefix(bare)])];
}

export function yelpJobLookupKeysForLead(input: {
  apiLeadId: string;
  conversationId?: string | null;
  temporaryEmail?: string | null;
}): string[] {
  const keys = new Set<string>();
  const fromEmail = yelpConversationIdFromProxyEmail(input.temporaryEmail);
  for (const raw of [input.apiLeadId, input.conversationId ?? null, fromEmail]) {
    for (const v of yelpStoredLeadIdVariants(raw)) keys.add(v);
  }
  return [...keys];
}

/** Hex inside `reply+<hex>@messaging.yelp.com` — same id email tickets store. */
export function yelpConversationIdFromProxyEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = /reply\+([0-9a-f]{16,64})@/i.exec(email);
  return m ? m[1].toLowerCase() : null;
}

/** GET /v3/leads/{id} candidates for a ticket: mapped API id first, then the stored hex. */
export function yelpGetLeadIdCandidates(job: {
  yelpLeadId: string | null;
  yelpApiLeadId?: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (v: string | null | undefined) => {
    const t = v?.trim();
    if (!t) return;
    const bare = stripYelpLeadIdPrefix(t);
    if (!bare || seen.has(bare)) return;
    seen.add(bare);
    out.push(bare);
  };
  add(job.yelpApiLeadId);
  add(job.yelpLeadId);
  return out;
}

export function yelpIdsEqual(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (/^[0-9a-f]+$/i.test(left) && /^[0-9a-f]+$/i.test(right)) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return false;
}

export type YelpLeadIdentity = {
  id: string;
  conversationId: string | null;
  temporaryEmail: string | null;
};

export function yelpLeadMatchesConversation(lead: YelpLeadIdentity, conversationId: string): boolean {
  const want = conversationId.trim();
  if (!want) return false;
  if (yelpIdsEqual(lead.id, want)) return true;
  if (lead.conversationId && yelpIdsEqual(lead.conversationId, want)) return true;
  const email = lead.temporaryEmail?.toLowerCase() ?? '';
  return email.includes(want.toLowerCase());
}
