/**
 * Attaches a Yelp notification email to an existing (or just-created) ticket:
 * link the Gmail thread with YELP_EMAIL provenance, and store the message the
 * same way a Gmail sync would, so the ticket Gmail section shows the thread.
 */
import { EventSource, GmailLinkSource, InboundLeadKind } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  formatYelpCorrespondenceActivityMessage,
  formatYelpCorrespondenceSnippet,
  YELP_CORRESPONDENCE_EVENT_NAME,
  yelpMessageDedupeLookupKeys,
  yelpScanShouldWriteGmailLink,
} from '@/lib/yelp/lead-correspondence';

export type YelpJobGmailState = {
  id: string;
  gmailThreadId: string | null;
  gmailConnectionId: string | null;
  gmailLinkSource: GmailLinkSource | null;
};

const JOB_GMAIL_SELECT = {
  id: true,
  gmailThreadId: true,
  gmailConnectionId: true,
  gmailLinkSource: true,
} as const;

export type YelpScanMailbox = {
  email: string;
  connectionId: string | null;
};

export type YelpScanMessageRecord = {
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string;
  from: string;
  to: string;
  receivedAt: Date | null;
  body: string;
};

export type RecordYelpEmailOnJobResult = {
  linked: boolean;
  storedMessage: boolean;
  loggedFollowUp: boolean;
};

export async function findExistingYelpJob(opts: {
  lookupKeys: string[];
  gmailThreadId: string;
}): Promise<YelpJobGmailState | null> {
  if (opts.lookupKeys.length > 0) {
    const byLeadId = await prisma.job.findFirst({
      where: { yelpLeadId: { in: opts.lookupKeys } },
      select: JOB_GMAIL_SELECT,
    });
    if (byLeadId) return byLeadId;
  }
  if (!opts.gmailThreadId) return null;
  return prisma.job.findFirst({
    where: {
      inboundLeadKind: InboundLeadKind.YELP_LEAD,
      gmailThreadId: opts.gmailThreadId,
    },
    select: JOB_GMAIL_SELECT,
  });
}

export async function findExistingYelpJobForMessage(
  message: Pick<YelpScanMessageRecord, 'from' | 'body' | 'gmailThreadId'>,
): Promise<YelpJobGmailState | null> {
  return findExistingYelpJob({
    lookupKeys: yelpMessageDedupeLookupKeys(message),
    gmailThreadId: message.gmailThreadId,
  });
}

async function correspondenceAlreadyLogged(jobId: string, gmailMessageId: string): Promise<boolean> {
  const hit = await prisma.activityLog.findFirst({
    where: {
      jobId,
      eventName: YELP_CORRESPONDENCE_EVENT_NAME,
      metadata: { path: ['gmailMessageId'], equals: gmailMessageId },
    },
    select: { id: true },
  });
  return hit != null;
}

/**
 * Link the Gmail thread (once) and upsert this message. Idempotent on re-scan:
 * the unique (jobId, gmailMessageId) row and the correspondence activity key
 * on gmailMessageId keep a second pass from duplicating anything.
 */
export async function recordYelpEmailOnJob(opts: {
  job: YelpJobGmailState;
  mailbox: YelpScanMailbox;
  message: YelpScanMessageRecord;
  followUp: boolean;
}): Promise<RecordYelpEmailOnJobResult> {
  const { job, mailbox, message } = opts;
  let linked = false;

  if (mailbox.connectionId && yelpScanShouldWriteGmailLink(job, message.gmailThreadId)) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        gmailThreadId: message.gmailThreadId,
        gmailConnectionId: mailbox.connectionId,
        gmailLinkSource: GmailLinkSource.YELP_EMAIL,
        gmailLinkedAt: new Date(),
        gmailLinkConfidence: null,
      },
    });
    job.gmailThreadId = message.gmailThreadId;
    job.gmailConnectionId = mailbox.connectionId;
    job.gmailLinkSource = GmailLinkSource.YELP_EMAIL;

    await prisma.activityLog.create({
      data: {
        jobId: job.id,
        source: EventSource.SYSTEM,
        eventName: 'gmail.thread_linked_from_yelp_email',
        message: `Gmail thread attached from the Yelp lead email (${mailbox.email}).`,
        metadata: {
          threadId: message.gmailThreadId,
          mailboxEmail: mailbox.email,
          gmailConnectionId: mailbox.connectionId,
          gmailMessageId: message.gmailMessageId,
          linkSource: GmailLinkSource.YELP_EMAIL,
        },
      },
    });
    linked = true;
  }

  const snippet = formatYelpCorrespondenceSnippet(message.body);
  await prisma.gmailSyncedMessage.upsert({
    where: { jobId_gmailMessageId: { jobId: job.id, gmailMessageId: message.gmailMessageId } },
    create: {
      jobId: job.id,
      gmailMessageId: message.gmailMessageId,
      gmailThreadId: message.gmailThreadId,
      subject: message.subject.slice(0, 512) || null,
      fromAddr: message.from.slice(0, 512) || null,
      toAddr: message.to.slice(0, 512) || null,
      date: message.receivedAt,
      snippet: snippet || null,
    },
    update: {
      gmailThreadId: message.gmailThreadId,
      subject: message.subject.slice(0, 512) || null,
      fromAddr: message.from.slice(0, 512) || null,
      toAddr: message.to.slice(0, 512) || null,
      date: message.receivedAt,
      snippet: snippet || null,
    },
  });

  let loggedFollowUp = false;
  if (opts.followUp && !(await correspondenceAlreadyLogged(job.id, message.gmailMessageId))) {
    await prisma.activityLog.create({
      data: {
        jobId: job.id,
        source: EventSource.SYSTEM,
        eventName: YELP_CORRESPONDENCE_EVENT_NAME,
        message: formatYelpCorrespondenceActivityMessage(message.subject),
        metadata: {
          gmailMessageId: message.gmailMessageId,
          gmailThreadId: message.gmailThreadId,
          subject: message.subject.slice(0, 300),
        },
      },
    });
    loggedFollowUp = true;
  }

  return { linked, storedMessage: true, loggedFollowUp };
}
