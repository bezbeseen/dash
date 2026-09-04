/**
 * Follow-up Yelp notification emails share the original conversation hex but are not
 * new quote requests. The scan attaches them to the existing ticket instead of
 * opening a duplicate or dropping them as `not_a_lead`.
 *
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */
import { GmailLinkSource } from '@prisma/client';
import { cleanYelpEmailBody, extractYelpConversationId } from '@/lib/yelp/lead-email';
import { hasYelpRaqSentence, type YelpEmailClassification, type YelpRejectionCategory } from '@/lib/yelp/lead-classify';
import { redactDestructiveYelpUrls } from '@/lib/yelp/url';

/** Gmail stores a short snippet; keep enough of the cleaned body to read a reply. */
export const YELP_CORRESPONDENCE_SNIPPET_MAX = 2000;

export function isYelpReplySubject(subject: string): boolean {
  return /^(?:re|fw|fwd)\s*:/i.test(subject.trim());
}

/**
 * Only RAQ mail opens a ticket in the first pass of a scan. Follow-ups ("RE: …",
 * "sent you a message") wait until that ticket exists so they cannot steal the
 * description or create a duplicate when Gmail returns newest-first.
 */
export function isYelpFirstContactLead(body: string, classification: YelpEmailClassification): boolean {
  return classification.isLead && hasYelpRaqSentence(body);
}

/**
 * Keys that match Job.yelpLeadId for this message. Same helper the ticket writer
 * uses, but it does not need a full parse — follow-ups that fail the lead
 * classifier still carry `reply+<hex>@messaging.yelp.com`.
 */
export function yelpMessageDedupeLookupKeys(input: {
  from: string;
  body: string;
  gmailThreadId: string;
}): string[] {
  const conversationId = extractYelpConversationId(input.from, input.body);
  if (conversationId) return [`yelp:${conversationId}`, conversationId];
  return [`gmail-thread:${input.gmailThreadId}`];
}

/**
 * Marketing and non-Yelp senders must never attach to a ticket even if a hex
 * happens to appear in the body. Everything else may, once a ticket exists.
 */
export function yelpRejectionMayAttachToExistingTicket(category: YelpRejectionCategory | null): boolean {
  if (category == null) return true;
  return category !== 'consumer_marketing' && category !== 'not_yelp_sender';
}

export function formatYelpCorrespondenceSnippet(body: string): string {
  return redactDestructiveYelpUrls(cleanYelpEmailBody(body)).trim().slice(0, YELP_CORRESPONDENCE_SNIPPET_MAX);
}

export function formatYelpCorrespondenceActivityMessage(subject: string): string {
  const trimmed = subject.trim().slice(0, 300) || '(no subject)';
  return `Yelp follow-up attached: ${trimmed}`;
}

/**
 * Yelp's own thread id is authoritative over an AUTO match. A human-set or
 * human-confirmed link is left alone; the follow-up still lands as a synced
 * message on the ticket.
 */
export function yelpScanShouldWriteGmailLink(
  job: { gmailThreadId: string | null; gmailLinkSource: GmailLinkSource | null },
  candidateThreadId: string,
): boolean {
  if (!candidateThreadId) return false;
  if (!job.gmailThreadId) return true;
  if (job.gmailLinkSource === GmailLinkSource.MANUAL || job.gmailLinkSource === GmailLinkSource.CONFIRMED) {
    return false;
  }
  if (job.gmailThreadId === candidateThreadId && job.gmailLinkSource === GmailLinkSource.YELP_EMAIL) {
    return false;
  }
  return job.gmailLinkSource == null || job.gmailLinkSource === GmailLinkSource.AUTO;
}
