/**
 * Builds the ticket Correspondence thread: synced Gmail messages plus Yelp
 * follow-up activity that is not already represented as a Gmail row.
 *
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */
import type { Prisma } from '@prisma/client';
import { emailComparisonKey, parseAddressEntries, parseAddressList } from '@/lib/gmail/thread-match';
import { isYelpProxyEmailAddress, senderIsYelp } from '@/lib/yelp/lead-email';
import {
  formatYelpCorrespondenceSnippet,
  YELP_CORRESPONDENCE_EVENT_NAME,
} from '@/lib/yelp/lead-correspondence';
import { redactDestructiveYelpUrls } from '@/lib/yelp/url';

export type CorrespondenceSide = 'customer' | 'shop' | 'unknown';
export type CorrespondenceChannel = 'gmail' | 'yelp';

export type CorrespondenceAttachment = {
  id: string;
  filename: string;
  sizeBytes: number;
};

export type CorrespondenceGmailMessage = {
  id: string;
  gmailMessageId: string;
  subject: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  date: Date | null;
  snippet: string | null;
  createdAt: Date;
  attachments: CorrespondenceAttachment[];
};

export type CorrespondenceActivity = {
  id: string;
  eventName: string;
  message: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

export type CorrespondenceItem = {
  id: string;
  at: Date;
  side: CorrespondenceSide;
  channel: CorrespondenceChannel;
  subject: string | null;
  fromLabel: string;
  fromAddr: string | null;
  toAddr: string | null;
  body: string;
  trimmedBoilerplate: boolean;
  originalBody: string | null;
  attachments: CorrespondenceAttachment[];
};

export type BuildCorrespondenceThreadInput = {
  messages: CorrespondenceGmailMessage[];
  activityLogs: CorrespondenceActivity[];
  shopMailboxEmails: string[];
};

function shopMailboxKeys(emails: string[]): Set<string> {
  const keys = new Set<string>();
  for (const raw of emails) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    keys.add(emailComparisonKey(trimmed));
  }
  return keys;
}

export function correspondenceSideFromFromHeader(
  fromAddr: string | null | undefined,
  shopMailboxEmails: string[],
): CorrespondenceSide {
  const entries = parseAddressEntries(fromAddr);
  if (entries.length === 0) return 'unknown';

  const shop = shopMailboxKeys(shopMailboxEmails);
  for (const entry of entries) {
    if (shop.has(emailComparisonKey(entry.address))) return 'shop';
  }
  for (const entry of entries) {
    if (isYelpProxyEmailAddress(entry.address)) return 'customer';
  }
  if (fromAddr && senderIsYelp(fromAddr)) return 'customer';
  return 'unknown';
}

export function correspondenceFromLabel(fromAddr: string | null | undefined): string {
  const entries = parseAddressEntries(fromAddr);
  const first = entries[0];
  if (!first) {
    const fallback = fromAddr?.trim();
    return fallback && fallback.length > 0 ? fallback : 'Unknown sender';
  }
  return first.name ? `${first.name} <${first.address}>` : first.address;
}

function looksLikeYelpCorrespondence(fromAddr: string | null, subject: string | null): boolean {
  if (fromAddr && senderIsYelp(fromAddr)) return true;
  for (const addr of parseAddressList(fromAddr)) {
    if (isYelpProxyEmailAddress(addr)) return true;
  }
  return Boolean(subject && /\byelp\b/i.test(subject));
}

export function correspondenceBodyForDisplay(input: {
  snippet: string | null | undefined;
  fromAddr: string | null;
  subject: string | null;
}): { body: string; trimmedBoilerplate: boolean; originalBody: string | null } {
  const raw = input.snippet?.trim() ?? '';
  if (!raw) {
    return { body: '', trimmedBoilerplate: false, originalBody: null };
  }

  const redacted = redactDestructiveYelpUrls(raw);
  if (!looksLikeYelpCorrespondence(input.fromAddr, input.subject)) {
    return { body: redacted, trimmedBoilerplate: false, originalBody: null };
  }

  const cleaned = formatYelpCorrespondenceSnippet(raw);
  const body = cleaned || redacted;
  const trimmedBoilerplate = body !== redacted && redacted.length > body.length;
  return {
    body,
    trimmedBoilerplate,
    originalBody: trimmedBoilerplate ? redacted : null,
  };
}

function asJsonObject(meta: Prisma.JsonValue | null | undefined): Prisma.JsonObject | null {
  if (meta === null || meta === undefined || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  return meta;
}

export function yelpCorrespondenceGmailMessageId(metadata: Prisma.JsonValue | null | undefined): string | null {
  const obj = asJsonObject(metadata);
  if (!obj) return null;
  const id = obj.gmailMessageId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function yelpCorrespondenceSubject(metadata: Prisma.JsonValue | null | undefined): string | null {
  const obj = asJsonObject(metadata);
  if (!obj) return null;
  const subject = obj.subject;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : null;
}

function compareChronological(a: CorrespondenceItem, b: CorrespondenceItem): number {
  const delta = a.at.getTime() - b.at.getTime();
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id);
}

export function buildCorrespondenceThread(input: BuildCorrespondenceThreadInput): CorrespondenceItem[] {
  const shopMailboxEmails = input.shopMailboxEmails;
  const items: CorrespondenceItem[] = [];
  const seenGmailMessageIds = new Set<string>();

  for (const message of input.messages) {
    seenGmailMessageIds.add(message.gmailMessageId);
    const display = correspondenceBodyForDisplay({
      snippet: message.snippet,
      fromAddr: message.fromAddr,
      subject: message.subject,
    });
    items.push({
      id: `gmail:${message.id}`,
      at: message.date ?? message.createdAt,
      side: correspondenceSideFromFromHeader(message.fromAddr, shopMailboxEmails),
      channel: 'gmail',
      subject: message.subject,
      fromLabel: correspondenceFromLabel(message.fromAddr),
      fromAddr: message.fromAddr,
      toAddr: message.toAddr,
      body: display.body,
      trimmedBoilerplate: display.trimmedBoilerplate,
      originalBody: display.originalBody,
      attachments: message.attachments,
    });
  }

  for (const log of input.activityLogs) {
    if (log.eventName !== YELP_CORRESPONDENCE_EVENT_NAME) continue;
    const gmailMessageId = yelpCorrespondenceGmailMessageId(log.metadata);
    if (gmailMessageId && seenGmailMessageIds.has(gmailMessageId)) continue;

    const subject = yelpCorrespondenceSubject(log.metadata);
    const display = correspondenceBodyForDisplay({
      snippet: log.message,
      fromAddr: null,
      subject,
    });
    items.push({
      id: `yelp:${log.id}`,
      at: log.createdAt,
      side: 'customer',
      channel: 'yelp',
      subject,
      fromLabel: 'Yelp follow-up',
      fromAddr: null,
      toAddr: null,
      body: display.body || log.message,
      trimmedBoilerplate: display.trimmedBoilerplate,
      originalBody: display.originalBody,
      attachments: [],
    });
  }

  items.sort(compareChronological);
  return items;
}
