import { EventSource } from '@prisma/client';
import { google } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { extractGmailMessageText, gmailHeader } from '@/lib/gmail/message-text';
import { getGmailOAuth2ClientForSendMailbox } from '@/lib/gmail/tokens-db';
import { resolveYelpLeadMailboxState, type YelpMailboxState } from '@/lib/yelp/lead-mailbox';
import { parseYelpLeadEmail, senderIsYelp, type ParsedYelpLeadEmail } from '@/lib/yelp/lead-email';
import {
  classifyYelpLeadEmail,
  resolveYelpOwnIdentity,
  type YelpEmailClassification,
  type YelpRejectionCategory,
} from '@/lib/yelp/lead-classify';
import { yelpLeadDedupeLookupKeys, yelpLeadEmailJobWriteData } from '@/lib/yelp/lead-ticket-write';
import {
  isYelpFirstContactLead,
  yelpMessageDedupeLookupKeys,
  yelpRejectionMayAttachToExistingTicket,
} from '@/lib/yelp/lead-correspondence';
import {
  findExistingYelpJobForMessage,
  recordYelpEmailOnJob,
  type YelpJobGmailState,
  type YelpScanMailbox,
  type YelpScanMessageRecord,
} from '@/lib/yelp/link-gmail-from-scan';
import { summarizeYelpScan, type YelpEmailOutcome, type YelpScanCounts } from '@/lib/yelp/scan-summary';
import {
  resolveYelpScanLimits,
  YELP_SCAN_MAX_MESSAGES,
  type YelpScanLimits,
} from '@/lib/yelp/scan-limits';

/** Small batches keep the whole scan inside the serverless function budget. */
const FETCH_BATCH_SIZE = 5;

export type YelpEmailCandidate = {
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  outcome: YelpEmailOutcome;
  /** Why a non-lead was binned, so the preview explains itself. */
  rejectionCategory: YelpRejectionCategory | null;
  /** Human-readable detail behind the outcome; null when the lead was imported cleanly. */
  skipReason: string | null;
  parsed: ParsedYelpLeadEmail | null;
  existingJobId: string | null;
};

export type YelpEmailScanResult = {
  mailboxEmail: string;
  /** Which setting chose this mailbox, so results are self-describing. */
  mailbox: YelpMailboxState;
  query: string;
  counts: YelpScanCounts;
  createdJobIds: string[];
  dryRun: boolean;
  limits: YelpScanLimits;
  /** True when Gmail had more matching mail than this scan looked at. */
  truncated: boolean;
  truncationReason: string | null;
  candidates: YelpEmailCandidate[];
};

/** Thrown when the configured mailbox is missing or not Gmail-connected. */
export class YelpMailboxNotReadyError extends Error {
  readonly state: YelpMailboxState;

  constructor(state: YelpMailboxState) {
    super(state.reason ?? 'Yelp lead mailbox is not ready.');
    this.name = 'YelpMailboxNotReadyError';
    this.state = state;
  }
}

type ExaminedYelpMessage = {
  record: YelpScanMessageRecord;
  receivedAtIso: string | null;
  verdict: YelpEmailClassification;
  parsed: ParsedYelpLeadEmail;
  firstContact: boolean;
};

function candidateBase(item: ExaminedYelpMessage) {
  return {
    gmailMessageId: item.record.gmailMessageId,
    gmailThreadId: item.record.gmailThreadId,
    subject: item.record.subject,
    from: item.record.from,
    receivedAt: item.receivedAtIso,
  };
}

async function attachToExistingJob(opts: {
  job: YelpJobGmailState;
  mailbox: YelpScanMailbox;
  item: ExaminedYelpMessage;
  followUp: boolean;
  dryRun: boolean;
}): Promise<{ skipReason: string }> {
  if (opts.dryRun) {
    return {
      skipReason: opts.followUp
        ? 'follow-up would attach to existing ticket'
        : 'already imported; Gmail thread would be linked if missing',
    };
  }
  const result = await recordYelpEmailOnJob({
    job: opts.job,
    mailbox: opts.mailbox,
    message: opts.item.record,
    followUp: opts.followUp,
  });
  if (result.loggedFollowUp && result.linked) {
    return { skipReason: 'follow-up attached and Gmail thread linked' };
  }
  if (result.loggedFollowUp) {
    return { skipReason: 'follow-up attached to existing ticket' };
  }
  if (result.linked) {
    return { skipReason: 'already imported; Gmail thread linked' };
  }
  return { skipReason: 'already imported' };
}

async function createYelpLeadTicket(opts: {
  mailbox: YelpScanMailbox;
  mailboxEmail: string;
  item: ExaminedYelpMessage;
}): Promise<{ jobId: string } | { error: string }> {
  const { item, mailbox, mailboxEmail } = opts;
  try {
    const job = await prisma.job.create({
      data: yelpLeadEmailJobWriteData(item.parsed, item.record.receivedAt),
    });

    await prisma.activityLog.create({
      data: {
        jobId: job.id,
        source: EventSource.SYSTEM,
        eventName: 'inbound.yelp_lead_email',
        message: 'Pre-quote ticket created from a Yelp lead notification email.',
        metadata: {
          mailboxEmail,
          gmailMessageId: item.record.gmailMessageId,
          gmailThreadId: item.record.gmailThreadId,
          subject: item.record.subject,
          dedupeKey: item.parsed.dedupeKey,
          dedupeFromYelp: item.parsed.dedupeFromYelp,
        },
      },
    });

    if (item.parsed.leadEmail) {
      await prisma.linkedEmail.create({
        data: {
          jobId: job.id,
          subject: item.record.subject.slice(0, 512) || null,
          fromAddr: item.parsed.leadEmail,
          sentAt: item.record.receivedAt,
          notes: 'Yelp lead email (consumer or Yelp reply-proxy address).',
        },
      });
    }

    await recordYelpEmailOnJob({
      job: {
        id: job.id,
        gmailThreadId: job.gmailThreadId,
        gmailConnectionId: job.gmailConnectionId,
        gmailLinkSource: job.gmailLinkSource,
      },
      mailbox,
      message: item.record,
      followUp: false,
    });

    return { jobId: job.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.slice(0, 200) };
  }
}

/**
 * Reads Yelp lead notification emails out of a connected mailbox and opens
 * pre-quote tickets for the ones Dash has not seen yet. Follow-ups that share a
 * conversation hex attach to the existing ticket (and its Gmail thread) instead
 * of being dropped as not-a-lead.
 */
export async function scanYelpLeadEmails(opts: {
  mailboxEmail?: string | null;
  lookbackDays?: number;
  maxMessages?: number;
  dryRun?: boolean;
}): Promise<YelpEmailScanResult> {
  const limits: YelpScanLimits = resolveYelpScanLimits(opts);
  const { lookbackDays, maxMessages } = limits;
  const dryRun = opts.dryRun ?? false;

  const mailboxState = await resolveYelpLeadMailboxState(opts.mailboxEmail ?? null);
  if (!mailboxState.ready) {
    throw new YelpMailboxNotReadyError(mailboxState);
  }
  const mailboxEmail = mailboxState.mailbox;

  const identity = resolveYelpOwnIdentity(mailboxEmail);

  const auth = await getGmailOAuth2ClientForSendMailbox(mailboxEmail);
  const gmail = google.gmail({ version: 'v1', auth });
  const query = `from:yelp.com newer_than:${lookbackDays}d`;

  const connection = await prisma.gmailConnection.findFirst({
    where: { googleEmail: { equals: mailboxEmail, mode: 'insensitive' } },
    select: { id: true },
  });
  const scanMailbox: YelpScanMailbox = {
    email: mailboxEmail,
    connectionId: connection?.id ?? null,
  };

  // Gmail accepts either the address or "me"; which one works varies by account type.
  const userIds = [mailboxEmail, 'me'];
  let ids: { id: string; threadId: string }[] = [];
  let effectiveUserId = userIds[0];
  let listErr: unknown = null;
  let morePagesAvailable = false;

  for (const userId of userIds) {
    try {
      const list = await gmail.users.messages.list({ userId, q: query, maxResults: maxMessages });
      ids = (list.data.messages ?? [])
        .filter((m): m is { id: string; threadId: string } => Boolean(m.id && m.threadId))
        .map((m) => ({ id: m.id, threadId: m.threadId }));
      morePagesAvailable = Boolean(list.data.nextPageToken);
      effectiveUserId = userId;
      listErr = null;
      break;
    } catch (e) {
      listErr = e;
    }
  }
  if (listErr) {
    const msg = listErr instanceof Error ? listErr.message : String(listErr);
    throw new Error(`Gmail search failed for ${mailboxEmail}: ${msg}`);
  }

  const candidates: YelpEmailCandidate[] = [];
  const createdJobIds: string[] = [];
  const examined: ExaminedYelpMessage[] = [];

  for (let i = 0; i < ids.length; i += FETCH_BATCH_SIZE) {
    const batch = ids.slice(i, i + FETCH_BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async (ref) => {
        try {
          const res = await gmail.users.messages.get({
            userId: effectiveUserId,
            id: ref.id,
            format: 'full',
          });
          return { ref, data: res.data, error: null as string | null };
        } catch (e) {
          return { ref, data: null, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    for (const item of fetched) {
      if (!item.data) {
        candidates.push({
          gmailMessageId: item.ref.id,
          gmailThreadId: item.ref.threadId,
          subject: '',
          from: '',
          receivedAt: null,
          outcome: 'fetch_failed',
          rejectionCategory: null,
          skipReason: `fetch failed: ${item.error ?? 'unknown'}`,
          parsed: null,
          existingJobId: null,
        });
        continue;
      }

      const headers = item.data.payload?.headers;
      const subject = gmailHeader(headers, 'Subject');
      const from = gmailHeader(headers, 'From');
      const to = gmailHeader(headers, 'To');
      const dateHeader = gmailHeader(headers, 'Date');
      const parsedDate = dateHeader ? new Date(dateHeader) : null;
      const receivedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

      const bodyText = extractGmailMessageText(item.data.payload) || item.data.snippet || '';

      const record: YelpScanMessageRecord = {
        gmailMessageId: item.data.id ?? item.ref.id,
        gmailThreadId: item.data.threadId ?? item.ref.threadId,
        subject,
        from,
        to,
        receivedAt,
        body: bodyText,
      };

      if (!senderIsYelp(from)) {
        candidates.push({
          gmailMessageId: record.gmailMessageId,
          gmailThreadId: record.gmailThreadId,
          subject,
          from,
          receivedAt: receivedAt ? receivedAt.toISOString() : null,
          outcome: 'not_a_lead',
          rejectionCategory: 'not_yelp_sender',
          skipReason: 'sender is not yelp.com',
          parsed: null,
          existingJobId: null,
        });
        continue;
      }

      const verdict = classifyYelpLeadEmail({ subject, body: bodyText, from, identity });
      const parsed = parseYelpLeadEmail({
        subject,
        body: bodyText,
        from,
        gmailThreadId: record.gmailThreadId,
        receivedAt,
      });
      examined.push({
        record,
        receivedAtIso: receivedAt ? receivedAt.toISOString() : null,
        verdict,
        parsed,
        firstContact: isYelpFirstContactLead(bodyText, verdict),
      });
    }
  }

  const handled = new Set<string>();
  const openedThisScan = new Set<string>();

  const rememberOpened = (parsed: ParsedYelpLeadEmail) => {
    for (const key of yelpLeadDedupeLookupKeys(parsed)) openedThisScan.add(key);
  };

  const openedInThisScan = (item: ExaminedYelpMessage) =>
    yelpMessageDedupeLookupKeys(item.record).some((key) => openedThisScan.has(key));

  const pushCandidate = (
    item: ExaminedYelpMessage,
    fields: Pick<YelpEmailCandidate, 'outcome' | 'rejectionCategory' | 'skipReason' | 'existingJobId'>,
  ) => {
    handled.add(item.record.gmailMessageId);
    candidates.push({
      ...candidateBase(item),
      parsed: item.parsed,
      ...fields,
    });
  };

  // Pass 1: Request-a-Quote mail opens tickets (or backfills Gmail on ones we already have).
  for (const item of examined) {
    if (!item.firstContact) continue;
    const existing = await findExistingYelpJobForMessage(item.record);
    if (existing) {
      const { skipReason } = await attachToExistingJob({
        job: existing,
        mailbox: scanMailbox,
        item,
        followUp: false,
        dryRun,
      });
      pushCandidate(item, {
        outcome: 'already_imported',
        rejectionCategory: null,
        skipReason,
        existingJobId: existing.id,
      });
      continue;
    }
    if (dryRun) {
      rememberOpened(item.parsed);
      pushCandidate(item, {
        outcome: 'new_lead_preview',
        rejectionCategory: null,
        skipReason: 'dry run: no ticket written',
        existingJobId: null,
      });
      continue;
    }
    const created = await createYelpLeadTicket({ mailbox: scanMailbox, mailboxEmail, item });
    if ('error' in created) {
      pushCandidate(item, {
        outcome: 'create_failed',
        rejectionCategory: null,
        skipReason: `create failed: ${created.error}`,
        existingJobId: null,
      });
      continue;
    }
    createdJobIds.push(created.jobId);
    rememberOpened(item.parsed);
    pushCandidate(item, {
      outcome: 'ticket_created',
      rejectionCategory: null,
      skipReason: null,
      existingJobId: created.jobId,
    });
  }

  // Pass 2: follow-ups and weaker lead wording attach to the ticket pass 1 just opened
  // (Gmail lists newest first, so a RE: must not create a ticket before the original).
  for (const item of examined) {
    if (handled.has(item.record.gmailMessageId)) continue;

    const rejectionCategory = item.verdict.isLead ? null : item.verdict.category;
    const mayAttach = item.verdict.isLead || yelpRejectionMayAttachToExistingTicket(rejectionCategory);
    const existing = mayAttach ? await findExistingYelpJobForMessage(item.record) : null;

    if (existing) {
      const { skipReason } = await attachToExistingJob({
        job: existing,
        mailbox: scanMailbox,
        item,
        followUp: !item.firstContact,
        dryRun,
      });
      pushCandidate(item, {
        outcome: 'already_imported',
        rejectionCategory: null,
        skipReason,
        existingJobId: existing.id,
      });
      continue;
    }

    if (dryRun && openedInThisScan(item) && mayAttach) {
      pushCandidate(item, {
        outcome: 'already_imported',
        rejectionCategory: null,
        skipReason: 'follow-up would attach to a ticket this scan would create',
        existingJobId: null,
      });
      continue;
    }

    if (item.verdict.isLead) {
      if (dryRun) {
        pushCandidate(item, {
          outcome: 'new_lead_preview',
          rejectionCategory: null,
          skipReason: 'dry run: no ticket written',
          existingJobId: null,
        });
        continue;
      }
      const created = await createYelpLeadTicket({ mailbox: scanMailbox, mailboxEmail, item });
      if ('error' in created) {
        pushCandidate(item, {
          outcome: 'create_failed',
          rejectionCategory: null,
          skipReason: `create failed: ${created.error}`,
          existingJobId: null,
        });
        continue;
      }
      createdJobIds.push(created.jobId);
      pushCandidate(item, {
        outcome: 'ticket_created',
        rejectionCategory: null,
        skipReason: null,
        existingJobId: created.jobId,
      });
      continue;
    }

    pushCandidate(item, {
      outcome: 'not_a_lead',
      rejectionCategory: rejectionCategory,
      skipReason: item.verdict.isLead ? null : item.verdict.reason,
      existingJobId: null,
    });
  }

  const counts = summarizeYelpScan(candidates);
  const hitMessageCap = candidates.length >= maxMessages;
  const truncated = morePagesAvailable || hitMessageCap;
  const truncationReason = !truncated
    ? null
    : morePagesAvailable
      ? `Gmail has more than ${maxMessages} messages matching "${query}". Raise max (cap ${YELP_SCAN_MAX_MESSAGES}) or narrow the window to see the rest.`
      : `Stopped at the ${maxMessages}-message limit for this scan (cap ${YELP_SCAN_MAX_MESSAGES}).`;

  return {
    mailboxEmail,
    mailbox: mailboxState,
    query,
    counts,
    createdJobIds,
    dryRun,
    limits,
    truncated,
    truncationReason,
    candidates,
  };
}
