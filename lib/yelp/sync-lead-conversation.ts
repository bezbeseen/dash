import { EventSource, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  YELP_BIZ_EVENT_NAME,
  parseYelpLeadRecord,
  parseYelpLeadTextEvents,
  type YelpLeadRecord,
  type YelpLeadTextEvent,
} from '@/lib/yelp/lead-events';
import {
  yelpGetLeadIdCandidates,
  yelpJobLookupKeysForLead,
  yelpLeadMatchesConversation,
} from '@/lib/yelp/lead-ids';
import {
  YELP_LEADS_DENIED_MESSAGE,
  YelpLeadsApiError,
  yelpBusinessIdFromEnv,
  yelpFetchAllLeadEvents,
  yelpFetchLead,
  yelpLeadsAccessTokenConfigured,
  yelpListRecentBusinessLeadIds,
} from '@/lib/yelp/leads-api';
import { redactDestructiveYelpUrls } from '@/lib/yelp/url';

export type YelpBizSyncOk = {
  ok: true;
  apiLeadId: string;
  conversationId: string | null;
  fetched: number;
  inserted: number;
  resolvedVia: 'direct' | 'conversation_map';
};

export type YelpBizSyncFail = {
  ok: false;
  code: 'not_configured' | 'no_lead_id' | 'denied' | 'not_found' | 'api_error';
  message: string;
};

export type YelpBizSyncResult = YelpBizSyncOk | YelpBizSyncFail;

function deny(): YelpBizSyncFail {
  return { ok: false, code: 'denied', message: YELP_LEADS_DENIED_MESSAGE };
}

function failFromError(e: unknown): YelpBizSyncFail {
  if (e instanceof YelpLeadsApiError && e.isDenied) return deny();
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, code: 'api_error', message: msg.slice(0, 500) };
}

async function tryFetchLead(leadId: string): Promise<Record<string, unknown> | 'denied' | 'miss'> {
  try {
    return await yelpFetchLead(leadId);
  } catch (e) {
    if (e instanceof YelpLeadsApiError && e.isDenied) return 'denied';
    if (e instanceof YelpLeadsApiError && e.isNotFound) return 'miss';
    throw e;
  }
}

type ResolvedLead =
  | { ok: true; record: YelpLeadRecord; resolvedVia: 'direct' | 'conversation_map' }
  | YelpBizSyncFail;

async function resolveLeadForJob(job: {
  yelpLeadId: string | null;
  yelpApiLeadId: string | null;
}): Promise<ResolvedLead> {
  const candidates = yelpGetLeadIdCandidates(job);
  if (candidates.length === 0) {
    return { ok: false, code: 'no_lead_id', message: 'This ticket has no Yelp conversation id.' };
  }

  for (const id of candidates) {
    const result = await tryFetchLead(id);
    if (result === 'denied') return deny();
    if (result === 'miss') continue;
    const record = parseYelpLeadRecord(result);
    if (!record) {
      return { ok: false, code: 'api_error', message: 'Yelp Get Lead returned a lead without an id.' };
    }
    return { ok: true, record, resolvedVia: 'direct' };
  }

  const conversationId = yelpGetLeadIdCandidates({ yelpLeadId: job.yelpLeadId, yelpApiLeadId: null })[0] ?? null;
  const businessId = yelpBusinessIdFromEnv();
  if (!conversationId || !businessId) {
    return {
      ok: false,
      code: 'not_found',
      message:
        'Yelp Get Lead does not accept this ticket\'s conversation hex as a lead id. Set YELP_BUSINESS_ID to map it, or replies stay on Yelp Biz.',
    };
  }

  try {
    const leadIds = await yelpListRecentBusinessLeadIds(businessId);
    for (const leadId of leadIds) {
      const result = await tryFetchLead(leadId);
      if (result === 'denied') return deny();
      if (result === 'miss') continue;
      const record = parseYelpLeadRecord(result);
      if (!record) continue;
      if (yelpLeadMatchesConversation(record, conversationId)) {
        return { ok: true, record, resolvedVia: 'conversation_map' };
      }
    }
  } catch (e) {
    return failFromError(e);
  }

  return {
    ok: false,
    code: 'not_found',
    message:
      'Yelp Leads API has no lead whose id or conversation_id matches this ticket\'s hex. Replies stay on Yelp Biz.',
  };
}

async function bizEventAlreadyStored(jobId: string, eventId: string): Promise<boolean> {
  const hit = await prisma.activityLog.findFirst({
    where: {
      jobId,
      eventName: YELP_BIZ_EVENT_NAME,
      metadata: { path: ['eventId'], equals: eventId },
    },
    select: { id: true },
  });
  return hit != null;
}

function eventMetadata(
  apiLeadId: string,
  conversationId: string | null,
  event: YelpLeadTextEvent,
): Prisma.InputJsonObject {
  return {
    eventId: event.eventId,
    leadId: apiLeadId,
    userType: event.userType,
    text: event.text.slice(0, 8000),
    ...(conversationId ? { conversationId } : {}),
    ...(event.timeCreated ? { timeCreated: event.timeCreated } : {}),
    ...(event.userDisplayName ? { userDisplayName: event.userDisplayName } : {}),
    ...(event.channel ? { channel: event.channel } : {}),
  };
}

export async function persistYelpBizEventsForJob(opts: {
  jobId: string;
  apiLeadId: string;
  conversationId: string | null;
  events: unknown[];
}): Promise<{ fetched: number; inserted: number }> {
  const parsed = parseYelpLeadTextEvents(opts.events);
  let inserted = 0;
  for (const event of parsed) {
    if (await bizEventAlreadyStored(opts.jobId, event.eventId)) continue;
    const text = redactDestructiveYelpUrls(event.text);
    await prisma.activityLog.create({
      data: {
        jobId: opts.jobId,
        source: EventSource.SYSTEM,
        eventName: YELP_BIZ_EVENT_NAME,
        message: text.slice(0, 8000) || '(empty Yelp Biz message)',
        metadata: eventMetadata(opts.apiLeadId, opts.conversationId, { ...event, text }),
      },
    });
    inserted += 1;
  }
  return { fetched: parsed.length, inserted };
}

export async function rememberYelpApiLeadId(jobId: string, apiLeadId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { yelpApiLeadId: apiLeadId },
  });
}

export async function findJobForYelpLead(
  apiLeadId: string,
  conversationId: string | null,
  temporaryEmail?: string | null,
): Promise<{ id: string } | null> {
  const keys = yelpJobLookupKeysForLead({ apiLeadId, conversationId, temporaryEmail });
  return prisma.job.findFirst({
    where: {
      OR: [{ yelpApiLeadId: apiLeadId }, ...(keys.length > 0 ? [{ yelpLeadId: { in: keys } }] : [])],
    },
    select: { id: true },
  });
}

/**
 * Pull the Yelp Biz thread for an existing ticket and store TEXT events on ActivityLog.
 * Idempotent by Yelp event id. Does not scrape biz.yelp.com.
 */
export async function syncYelpBizConversationForJob(jobId: string): Promise<YelpBizSyncResult> {
  if (!yelpLeadsAccessTokenConfigured()) {
    return { ok: false, code: 'not_configured', message: 'YELP_LEADS_ACCESS_TOKEN is not set' };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, yelpLeadId: true, yelpApiLeadId: true },
  });
  if (!job) {
    return { ok: false, code: 'no_lead_id', message: 'Job not found.' };
  }

  let resolved: ResolvedLead;
  try {
    resolved = await resolveLeadForJob(job);
  } catch (e) {
    return failFromError(e);
  }
  if (!resolved.ok) return resolved;

  const { record, resolvedVia } = resolved;
  let events: unknown[];
  try {
    events = await yelpFetchAllLeadEvents(record.id);
  } catch (e) {
    return failFromError(e);
  }

  const persisted = await persistYelpBizEventsForJob({
    jobId,
    apiLeadId: record.id,
    conversationId: record.conversationId,
    events,
  });

  if (job.yelpApiLeadId !== record.id) {
    const taken = await prisma.job.findFirst({
      where: { yelpApiLeadId: record.id, NOT: { id: jobId } },
      select: { id: true },
    });
    if (!taken) await rememberYelpApiLeadId(jobId, record.id);
  }

  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.SYSTEM,
      eventName: 'yelp.conversation_synced',
      message:
        persisted.inserted > 0
          ? `Pulled ${persisted.fetched} Yelp Biz message(s); ${persisted.inserted} new.`
          : `Yelp Biz conversation already up to date (${persisted.fetched} message(s)).`,
      metadata: {
        apiLeadId: record.id,
        conversationId: record.conversationId,
        fetched: persisted.fetched,
        inserted: persisted.inserted,
        resolvedVia,
      },
    },
  });

  return {
    ok: true,
    apiLeadId: record.id,
    conversationId: record.conversationId,
    fetched: persisted.fetched,
    inserted: persisted.inserted,
    resolvedVia,
  };
}
