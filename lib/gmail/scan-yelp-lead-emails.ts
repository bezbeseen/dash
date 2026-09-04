import {
  BoardStatus,
  EstimateStatus,
  EventSource,
  InboundLeadKind,
  InvoiceStatus,
  ProductionStatus,
} from '@prisma/client';
import { google } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { extractGmailMessageText, gmailHeader } from '@/lib/gmail/message-text';
import { getGmailOAuth2ClientForSendMailbox } from '@/lib/gmail/tokens-db';
import { resolveYelpLeadMailboxState, type YelpMailboxState } from '@/lib/yelp/lead-mailbox';
import {
  looksLikeYelpLeadEmail,
  parseYelpLeadEmail,
  senderIsYelp,
  type ParsedYelpLeadEmail,
} from '@/lib/yelp/lead-email';

export const YELP_SCAN_DEFAULT_LOOKBACK_DAYS = 14;
export const YELP_SCAN_DEFAULT_MAX_MESSAGES = 20;

/** Small batches keep the whole scan inside the serverless function budget. */
const FETCH_BATCH_SIZE = 5;

export type YelpEmailCandidate = {
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  matched: boolean;
  skipReason: string | null;
  parsed: ParsedYelpLeadEmail | null;
  existingJobId: string | null;
};

export type YelpEmailScanResult = {
  mailboxEmail: string;
  /** Which setting chose this mailbox, so results are self-describing. */
  mailbox: YelpMailboxState;
  query: string;
  scanned: number;
  matched: number;
  createdJobIds: string[];
  skipped: number;
  dryRun: boolean;
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
  const keys = [parsed.dedupeKey];
  if (parsed.dedupeFromYelp) keys.push(parsed.dedupeKey.replace(/^yelp:/, ''));
  const hit = await prisma.job.findFirst({
    where: { yelpLeadId: { in: keys } },
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
  const lookbackDays = Math.min(Math.max(opts.lookbackDays ?? YELP_SCAN_DEFAULT_LOOKBACK_DAYS, 1), 180);
  const maxMessages = Math.min(Math.max(opts.maxMessages ?? YELP_SCAN_DEFAULT_MAX_MESSAGES, 1), 100);
  const dryRun = opts.dryRun ?? false;

  const mailboxState = await resolveYelpLeadMailboxState(opts.mailboxEmail ?? null);
  if (!mailboxState.ready) {
    throw new YelpMailboxNotReadyError(mailboxState);
  }
  const mailboxEmail = mailboxState.mailbox;

  const auth = await getGmailOAuth2ClientForSendMailbox(mailboxEmail);
  const gmail = google.gmail({ version: 'v1', auth });
  const query = `from:yelp.com newer_than:${lookbackDays}d`;

  // Gmail accepts either the address or "me"; which one works varies by account type.
  const userIds = [mailboxEmail, 'me'];
  let ids: { id: string; threadId: string }[] = [];
  let effectiveUserId = userIds[0];
  let listErr: unknown = null;

  for (const userId of userIds) {
    try {
      const list = await gmail.users.messages.list({ userId, q: query, maxResults: maxMessages });
      ids = (list.data.messages ?? [])
        .filter((m): m is { id: string; threadId: string } => Boolean(m.id && m.threadId))
        .map((m) => ({ id: m.id, threadId: m.threadId }));
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
          matched: false,
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
        candidates.push({ ...base, matched: false, skipReason: 'sender is not yelp.com', parsed: null, existingJobId: null });
        continue;
      }
      if (!looksLikeYelpLeadEmail(subject, bodyText)) {
        candidates.push({
          ...base,
          matched: false,
          skipReason: 'no lead wording (looks like a report, review or receipt)',
          parsed: null,
          existingJobId: null,
        });
        continue;
      }

      const parsed = parseYelpLeadEmail({
        subject,
        body: bodyText,
        gmailThreadId: base.gmailThreadId,
        receivedAt,
      });
      const existingJobId = await findExistingJobId(parsed);

      if (existingJobId) {
        candidates.push({ ...base, matched: true, skipReason: 'already imported', parsed, existingJobId });
        continue;
      }
      if (dryRun) {
        candidates.push({ ...base, matched: true, skipReason: null, parsed, existingJobId: null });
        continue;
      }

      try {
        const job = await prisma.job.create({
          data: {
            customerName: parsed.customerName,
            projectName: parsed.projectName,
            projectDescription: parsed.projectDescription,
            inboundLeadKind: InboundLeadKind.YELP_LEAD,
            yelpLeadId: parsed.dedupeKey,
            boardStatus: BoardStatus.REQUESTED,
            productionStatus: ProductionStatus.NOT_STARTED,
            estimateStatus: EstimateStatus.UNKNOWN,
            invoiceStatus: InvoiceStatus.NONE,
          },
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
        candidates.push({ ...base, matched: true, skipReason: null, parsed, existingJobId: job.id });
      } catch (e) {
        // A concurrent scan may have claimed the same yelpLeadId (unique column).
        const msg = e instanceof Error ? e.message : String(e);
        candidates.push({
          ...base,
          matched: true,
          skipReason: `create failed: ${msg.slice(0, 200)}`,
          parsed,
          existingJobId: null,
        });
      }
    }
  }

  const matched = candidates.filter((c) => c.matched).length;
  return {
    mailboxEmail,
    mailbox: mailboxState,
    query,
    scanned: candidates.length,
    matched,
    createdJobIds,
    skipped: matched - createdJobIds.length,
    dryRun,
    candidates,
  };
}
