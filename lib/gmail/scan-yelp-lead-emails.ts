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
  type YelpRejectionCategory,
} from '@/lib/yelp/lead-classify';
import { yelpLeadDedupeLookupKeys, yelpLeadEmailJobWriteData } from '@/lib/yelp/lead-ticket-write';
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

/** Both the email path and the (gated) Leads API path could see the same lead. */
async function findExistingJobId(parsed: ParsedYelpLeadEmail): Promise<string | null> {
  const hit = await prisma.job.findFirst({
    where: { yelpLeadId: { in: yelpLeadDedupeLookupKeys(parsed) } },
    select: { id: true },
  });
  return hit?.id ?? null;
}

/**
 * Reads Yelp lead notification emails out of a connected mailbox and opens
 * pre-quote tickets for the ones Dash has not seen yet.
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
      const dateHeader = gmailHeader(headers, 'Date');
      const parsedDate = dateHeader ? new Date(dateHeader) : null;
      const receivedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

      const bodyText = extractGmailMessageText(item.data.payload) || item.data.snippet || '';

      const base = {
        gmailMessageId: item.data.id ?? item.ref.id,
        gmailThreadId: item.data.threadId ?? item.ref.threadId,
        subject,
        from,
        receivedAt: receivedAt ? receivedAt.toISOString() : null,
      };

      if (!senderIsYelp(from)) {
        candidates.push({
          ...base,
          outcome: 'not_a_lead',
          rejectionCategory: 'not_yelp_sender',
          skipReason: 'sender is not yelp.com',
          parsed: null,
          existingJobId: null,
        });
        continue;
      }
      const verdict = classifyYelpLeadEmail({ subject, body: bodyText, from, identity });
      if (!verdict.isLead) {
        candidates.push({
          ...base,
          outcome: 'not_a_lead',
          rejectionCategory: verdict.category,
          skipReason: verdict.reason,
          parsed: null,
          existingJobId: null,
        });
        continue;
      }

      const parsed = parseYelpLeadEmail({
        subject,
        body: bodyText,
        from,
        gmailThreadId: base.gmailThreadId,
        receivedAt,
      });
      const existingJobId = await findExistingJobId(parsed);

      if (existingJobId) {
        candidates.push({
          ...base,
          outcome: 'already_imported',
          rejectionCategory: null,
          skipReason: 'already imported',
          parsed,
          existingJobId,
        });
        continue;
      }
      if (dryRun) {
        candidates.push({
          ...base,
          outcome: 'new_lead_preview',
          rejectionCategory: null,
          skipReason: 'dry run: no ticket written',
          parsed,
          existingJobId: null,
        });
        continue;
      }

      try {
        const job = await prisma.job.create({
          data: yelpLeadEmailJobWriteData(parsed, receivedAt),
        });

        await prisma.activityLog.create({
          data: {
            jobId: job.id,
            source: EventSource.SYSTEM,
            eventName: 'inbound.yelp_lead_email',
            message: 'Pre-quote ticket created from a Yelp lead notification email.',
            metadata: {
              mailboxEmail,
              gmailMessageId: base.gmailMessageId,
              gmailThreadId: base.gmailThreadId,
              subject,
              dedupeKey: parsed.dedupeKey,
              dedupeFromYelp: parsed.dedupeFromYelp,
            },
          },
        });

        if (parsed.leadEmail) {
          await prisma.linkedEmail.create({
            data: {
              jobId: job.id,
              subject: subject.slice(0, 512) || null,
              fromAddr: parsed.leadEmail,
              sentAt: receivedAt,
              notes: 'Yelp lead email (consumer or Yelp reply-proxy address).',
            },
          });
        }

        createdJobIds.push(job.id);
        candidates.push({
          ...base,
          outcome: 'ticket_created',
          rejectionCategory: null,
          skipReason: null,
          parsed,
          existingJobId: job.id,
        });
      } catch (e) {
        // A concurrent scan may have claimed the same yelpLeadId (unique column).
        const msg = e instanceof Error ? e.message : String(e);
        candidates.push({
          ...base,
          outcome: 'create_failed',
          rejectionCategory: null,
          skipReason: `create failed: ${msg.slice(0, 200)}`,
          parsed,
          existingJobId: null,
        });
      }
    }
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
