import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';
import {
  findFreeTextAnswer,
  findServiceLocation,
  findServiceZip,
  formatYelpSurveyLines,
  parseYelpSurveyPairsFromText,
  type YelpSurveyPair,
} from '@/lib/yelp/survey';
import { redactDestructiveYelpUrls, safeYelpUrl, YELP_BIZ_INBOX_URL } from '@/lib/yelp/url';

/**
 * Parses Yelp "new lead / new message" notification emails into pre-quote ticket fields.
 *
 * Dash cannot use the Yelp Leads API (it is gated to advertising resellers with a minimum
 * spend), so the mailbox that receives Yelp notifications is the ingest path instead. Yelp
 * changes these templates periodically, so every field is optional and the cleaned email
 * body is always kept in the description.
 */

export type ParsedYelpLeadEmail = {
  /** Stable key for Job.yelpLeadId. Yelp conversation id when present, else the Gmail thread. */
  dedupeKey: string;
  /** True when dedupeKey came from Yelp's own conversation id rather than the Gmail thread. */
  dedupeFromYelp: boolean;
  customerName: string;
  projectName: string;
  projectDescription: string | null;
  leadEmail: string | null;
  phone: string | null;
  jobType: string | null;
  /** Yelp's conversation id, so the right thread is findable from the inbox. */
  conversationId: string | null;
  /** Always safe to click: never one of Yelp's one-click action endpoints. */
  threadUrl: string | null;
  serviceZip: string | null;
  survey: YelpSurveyPair[];
  customerNotes: string | null;
};

const YELP_SENDER = /(^|[@.])yelp\.com$/i;

/** Subject/body markers that distinguish lead mail from ad receipts, reviews and newsletters. */
const LEAD_SIGNALS = [
  /request(?:ed)?\s+a\s+quote/i,
  /quote\s+request/i,
  /new\s+lead/i,
  /sent\s+you\s+a\s+(?:new\s+)?message/i,
  /new\s+message/i,
  /responded\s+to\s+your\s+(?:message|quote)/i,
  /wants\s+a\s+quote/i,
  /is\s+interested\s+in/i,
  /replied\s+to\s+your/i,
  /you\s+have\s+a\s+new/i,
];

/** Mail from Yelp that is definitely not a customer lead. */
const NON_LEAD_SIGNALS = [
  /your\s+(?:ad|advertising|campaign)\s+(?:report|summary|performance|receipt|invoice)/i,
  /payment\s+(?:receipt|confirmation|failed)/i,
  /your\s+invoice/i,
  /new\s+review/i,
  /weekly\s+(?:summary|report|digest)/i,
  /monthly\s+(?:summary|report|digest)/i,
  /password/i,
  /verify\s+your\s+email/i,
  /billing/i,
];

/**
 * True for Yelp's per-lead reply proxy addresses, which stand in for the consumer.
 * Yelp's own notification senders live on yelp.com too and must not be mistaken for a customer.
 */
export function isYelpProxyEmailAddress(address: string): boolean {
  const [local = '', domain = ''] = address.trim().toLowerCase().split('@');
  if (!/(?:^|\.)yelp\.com$/.test(domain)) return false;
  // "no-reply" contains "reply"; Yelp's own notification sender must not read as a proxy.
  if (/^(?:no-?reply|do-?not-?reply|donotreply)\b/.test(local)) return false;
  if (/^(?:messaging|reply|leads?|msg)\./.test(domain)) return true;
  return /(?:lead|msg|messag|reply)/.test(local) || /[._-][a-z0-9]{6,}$/.test(local);
}

export function senderIsYelp(fromHeader: string): boolean {
  const m = /<([^>]+)>/.exec(fromHeader);
  const addr = (m ? m[1] : fromHeader).trim().toLowerCase();
  const domain = addr.split('@').pop() ?? '';
  return YELP_SENDER.test(domain);
}

export function looksLikeYelpLeadEmail(subject: string, body: string): boolean {
  const haystack = `${subject}\n${body.slice(0, 4000)}`;
  if (NON_LEAD_SIGNALS.some((re) => re.test(subject))) return false;
  return LEAD_SIGNALS.some((re) => re.test(haystack));
}

/**
 * Yelp's email preheader is padded with soft hyphens and zero-width joiners to control
 * the inbox preview line; hundreds of them arrive in the text part.
 */
const INVISIBLE_CHARS = /[\u00ad\u034f\u200b-\u200f\u2060\u2061\u2062\u2063\u2064\ufeff]/g;

/** Yelp ships this untranslated in the text part, e.g. `{num_attachments, plural, one {...} other {...}}`. */
const ICU_PLACEHOLDER = /\{\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi;

/** Yelp's response-rate nagging and CTA chrome, none of which belongs on a ticket. */
const BOILERPLATE_LINES = [
  /^reply\s+to\s+stay\s+eligible/i,
  /^don['’]?t\s+miss\s+out\s+on\s+future\s+leads/i,
  /^having\s+a\s+low\s+response\s+rate/i,
  /^your\s+messaging\s+may\s+also\s+be\s+turned\s+off/i,
  /^your\s+response\s+(?:time|rate)\b/i,
  /^keep\s+track\s+of\s+incoming\s+leads/i,
  /^get\s+text\s+notifications?$/i,
  /^i['’]?m\s+not\s+interested$/i,
  /^i\s+already\s+replied$/i,
  /^report\s+this\s+conversation$/i,
  /^or\s+reply\s+directly\s+to\s+this\s+email/i,
  /^reply\s+to\s+.{1,60}\s+on\s+yelp(?:\s+biz)?$/i,
  /^view\s+(?:and\s+)?repl(?:y|ies)/i,
  /^sent\s+to\s+/i,
  /^unsubscribe/i,
  /^manage\s+(?:your\s+)?(?:email\s+)?(?:notification\s+)?(?:preferences|settings)/i,
  /^download\s+the\s+yelp/i,
  /^(?:©|\(c\)|copyright)\s*\d{4}\s*yelp/i,
  /^yelp\s+inc\.?\s*,?\s*\d+/i,
  /^this\s+(?:email|message)\s+was\s+sent/i,
  /^you\s+(?:are\s+)?receiv(?:ed|ing)\s+this/i,
  /^\d+\s+\w[\w\s.]*\s+(?:rd|road|st|street|ave|avenue|blvd|way|dr|drive)\b.*\b[a-z]{2}\s+\d{5}\b/i,
];

/** "Your response time" is followed by its value on the next line. */
const RESPONSE_STAT_LABEL = /^your\s+response\s+(?:time|rate)\b/i;
const RESPONSE_STAT_VALUE = /^(?:\d+\s*%|\d+\s*(?:min|mins|minute|minutes|hour|hours|day|days)\b.*)$/i;

function isBoilerplateLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (BOILERPLATE_LINES.some((re) => re.test(t))) return true;
  // Yelp's link markup collapses to empty brackets and bare "[link]" crumbs.
  if (/^[[\]()\s]*(?:\[link\])?[[\]()\s]*$/.test(t)) return true;
  // A line that is nothing but a Yelp URL; the inbox link is its own field.
  if (/^https?:\/\/\S+$/.test(t)) return true;
  return false;
}

function dropBoilerplate(lines: string[]): string[] {
  const kept: string[] = [];
  let dropStatValue = false;
  let insideQuestionnaire = false;

  for (const line of lines) {
    const t = line.trim();
    if (dropStatValue && RESPONSE_STAT_VALUE.test(t)) {
      dropStatValue = false;
      continue;
    }
    dropStatValue = RESPONSE_STAT_LABEL.test(t);
    if (t.endsWith('?')) insideQuestionnaire = true;
    // Bare counters sit beside the attachment placeholder with no documented meaning,
    // but an identical-looking line inside the questionnaire is a real answer.
    if (!insideQuestionnaire && /^\d{1,4}$/.test(t)) continue;
    if (isBoilerplateLine(line)) continue;
    kept.push(line);
  }
  return kept;
}

/**
 * Strips Yelp's template chrome so the questionnaire and the customer's own words remain.
 * Runs before any extraction so every field sees the same cleaned text.
 */
export function cleanYelpEmailBody(body: string): string {
  const withoutMarkup = body
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_CHARS, '')
    .replace(ICU_PLACEHOLDER, '')
    // Keep the label, drop the href: the inbox URL is surfaced as its own field.
    // The closing paren is optional because Yelp's long hrefs are often truncated.
    .replace(/\[([^\]]*)\]\(\s*(?:\[link\]|[^)\n]*)\)?/g, '$1')
    .replace(/\[link\]/g, '')
    .replace(/^\s*\[([^\][\n]{1,80})\]\s*$/gm, '$1')
    .replace(/(https?:\/\/[^\s"'<>]*?)[)\]}.,;:!]+(?=\s|$)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');

  const kept = dropBoilerplate(withoutMarkup.split('\n')).map((line) =>
    line.replace(/[ \t\u00a0]+/g, ' ').trimEnd(),
  );

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Yelp's conversation id appears as the `reply+<hex>@messaging.yelp.com` sender and again
 * in the inbox URL path. Preferring it over the Gmail thread keeps follow-up messages on
 * one ticket even when Gmail files them under a different thread.
 */
export function extractYelpConversationId(fromHeader: string, body: string): string | null {
  const fromReplyPlus = /reply\+([0-9a-f]{16,64})@/i.exec(fromHeader);
  if (fromReplyPlus) return normalizeConversationId(fromReplyPlus[1]);

  const patterns = [
    /biz\.yelp\.com\/messaging\/[a-z_]+\/([0-9a-f]{16,64})\b/i,
    /biz\.yelp\.com\/messaging\/[A-Za-z0-9_-]+\/thread\/([A-Za-z0-9_-]{8,})/i,
    /yelp\.com\/[^\s"'<>]*(?:lead_id|thread_id|conversation_id)=([A-Za-z0-9_-]{8,})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(body);
    if (m) return normalizeConversationId(m[1]);
  }
  return null;
}

/** Hex ids are case-insensitive; Yelp's base64-ish thread ids are not. */
function normalizeConversationId(id: string): string {
  return /^[0-9a-f]+$/i.test(id) ? id.toLowerCase() : id;
}

/**
 * Current lead notifications only link to one-click action endpoints, so no URL from the
 * email can be stored (see lib/yelp/url.ts). Older templates carried a real
 * `/messaging/<business-id>/thread/<conversation-id>` deep link; use that when present,
 * otherwise the plain inbox, which the conversation id on the ticket narrows down. The
 * business id needed to build the deep link ourselves is not in these emails.
 */
export function resolveSafeYelpInboxUrl(body: string, conversationId: string | null): string | null {
  const deepLink = /https?:\/\/[^\s"'<>]*biz\.yelp\.com\/messaging\/[A-Za-z0-9_-]+\/thread\/[^\s"'<>]*/i.exec(
    body,
  );
  const leadsCenter = /https?:\/\/[^\s"'<>]*biz\.yelp\.com\/leads_center\/[^\s"'<>]*/i.exec(body);

  for (const candidate of [deepLink?.[0], leadsCenter?.[0]]) {
    const safe = safeYelpUrl(candidate);
    if (safe) return safe;
  }

  const mentionsBizMessaging = /biz\.yelp\.com\/messaging/i.test(body);
  return conversationId || mentionsBizMessaging ? YELP_BIZ_INBOX_URL : null;
}

function firstMatch(body: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(body);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function tidyCustomerName(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  // Yelp shows consumers as "Rose L."; keep a genuine last initial, drop stray dots.
  const withInitial = /^(.*\S)\s+([A-Za-z])\.$/.exec(collapsed);
  if (withInitial) return `${withInitial[1]} ${withInitial[2].toUpperCase()}.`;
  return collapsed.replace(/[\s.,!]+$/, '').trim();
}

function extractCustomerName(subject: string, body: string): string | null {
  const fromSubject = firstMatch(subject, [
    // First-contact leads arrive as "<Business>'s response to <Customer>".
    /['’]s\s+response\s+to\s+(.+?)\s*$/i,
    /^(?:new\s+)?(?:quote\s+request|lead|message)\s+from\s+(.+?)\s*$/i,
    /^you\s+have\s+a\s+new\s+(?:lead|quote\s+request|message)\s+from\s+(.+?)\s*$/i,
    /^(.+?)\s+(?:sent\s+you|requested|wants|is\s+interested|replied)/i,
  ]);
  if (fromSubject) return tidyCustomerName(fromSubject.replace(/!+$/, ''));

  const fromBody = firstMatch(body, [
    /^\s*(?:customer|consumer|name|from|lead)\s*[:\-]\s*(.+?)\s*$/im,
    /^\s*(.{2,60}?)\s+(?:sent\s+you\s+a|requested\s+a\s+quote|is\s+requesting)/im,
  ]);
  return fromBody ? tidyCustomerName(fromBody) : null;
}

function extractPhone(body: string): string | null {
  const labelled = firstMatch(body, [
    /^\s*(?:phone|phone\s*number|mobile|tel|telephone|contact\s*number)\s*[:\-]\s*(.+?)\s*$/im,
  ]);
  const candidate =
    labelled ?? /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(body)?.[0] ?? null;
  if (!candidate) return null;
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return candidate.trim().slice(0, 80);
}

function extractEmail(body: string): string | null {
  const all = body.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  for (const raw of all) {
    const e = raw.toLowerCase();
    const [local = '', domain = ''] = e.split('@');

    if (/^(?:no-?reply|do-?not-?reply|donotreply|support|help|notifications?)$/.test(local)) continue;
    // The shop's own addresses appear in Yelp's "sent to" footer line.
    if (/(?:beseensignshop|getbeseen)\./.test(domain)) continue;

    // Yelp's own domains only count when they are a per-lead reply proxy.
    if (/(?:^|\.)yelp\.com$/.test(domain) && !isYelpProxyEmailAddress(e)) continue;

    return e.slice(0, 512);
  }
  return null;
}

/**
 * Rejects survey wording. The questionnaire is full of phrases like "do you need the
 * service?" and "do you need to print?", which an unanchored pattern will happily capture.
 */
function isPlausibleJobType(candidate: string): boolean {
  const t = candidate.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (t.includes('?')) return false;
  if (/^(?:the|a|an|to|your|my|this|that|it|they|do|does|is|are)\b/i.test(t)) return false;
  if (/\byou\b|\byour\b|\bneed\b|\brequire\b|\bhow\s+many\b/i.test(t)) return false;
  return /[a-z]/i.test(t);
}

/**
 * The job type is stated twice in Yelp's lead emails, both times unambiguously.
 * Both anchors are required to end at a period so survey questions cannot match.
 */
export function extractYelpJobType(subject: string, body: string): string | null {
  const anchored = firstMatch(body, [
    /^#*\s*you\s+have\s+a\s+new\s+(.+?)\s+request\s*[.!]/im,
    /\byou\s+have\s+a\s+new\s+(.+?)\s+request\s*[.!]/i,
    /requested\s+a\s+quote(?:\s+from\s+[^.\n]{1,80}?)?\s+for\s+(?:an?\s+|some\s+)?([^.\n]{3,60})\s*\./i,
  ]);
  if (anchored && isPlausibleJobType(anchored)) return anchored;

  const labelled = firstMatch(body, [
    /^\s*(?:job|job\s*type|project|service|category|requested\s+service)\s*[:\-]\s*(.+?)\s*$/im,
  ]);
  if (labelled && isPlausibleJobType(labelled)) return labelled;

  const fromSubject = firstMatch(subject, [/(?:quote\s+request|lead)\s+(?:for|about)\s+(.+?)\s*$/i]);
  return fromSubject && isPlausibleJobType(fromSubject) ? fromSubject : null;
}

/** Drops the questionnaire from the remaining prose so the description does not repeat it. */
function removeSurveyLines(text: string, pairs: YelpSurveyPair[]): string {
  if (pairs.length === 0) return text;
  const consumed = new Set<string>();
  for (const pair of pairs) {
    consumed.add(pair.question);
    for (const a of pair.answers) consumed.add(a);
  }
  return text
    .split('\n')
    .filter((line) => !consumed.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseYelpLeadEmail(input: {
  subject: string;
  body: string;
  gmailThreadId: string;
  receivedAt: Date | null;
  from?: string;
}): ParsedYelpLeadEmail {
  const { subject, body, gmailThreadId } = input;
  const from = input.from ?? '';

  const conversationId = extractYelpConversationId(from, body);
  const threadUrl = resolveSafeYelpInboxUrl(body, conversationId);
  const cleanBody = cleanYelpEmailBody(body);

  const survey = parseYelpSurveyPairsFromText(cleanBody);
  const customerNotes = findFreeTextAnswer(survey);
  const serviceZip = findServiceZip(survey);
  const serviceLocation = findServiceLocation(survey);

  const customerName = extractCustomerName(subject, cleanBody) ?? 'Yelp lead';
  const jobType = extractYelpJobType(subject, cleanBody);
  const phone = extractPhone(cleanBody);
  const leadEmail = extractEmail(cleanBody);

  const projectName = `Yelp · ${jobType ?? 'Request a Quote'}`.slice(0, 512);

  const lines: string[] = ['Source: Yelp (lead notification email)'];
  if (subject.trim()) lines.push(`Subject: ${subject.trim().slice(0, 300)}`);
  if (input.receivedAt) lines.push(`Received: ${input.receivedAt.toISOString()}`);
  if (jobType) lines.push(`Job type: ${jobType}`);
  if (serviceLocation) lines.push(`Service location: ${serviceLocation}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (leadEmail) lines.push(`Reply to: ${leadEmail}`);
  if (threadUrl) {
    lines.push(
      threadUrl === YELP_BIZ_INBOX_URL
        ? `Yelp inbox: ${threadUrl} (open the conversation with the customer's name)`
        : `Yelp inbox: ${threadUrl.slice(0, 500)}`,
    );
  }
  if (conversationId) lines.push(`Yelp conversation id: ${conversationId}`);

  if (customerNotes) {
    lines.push('');
    lines.push('Customer notes:');
    lines.push(customerNotes);
  }

  lines.push(...formatYelpSurveyLines(survey));

  const remainder = removeSurveyLines(cleanBody, survey);
  if (remainder) {
    lines.push('');
    lines.push('Email body:');
    lines.push(remainder.slice(0, 8000));
  }

  return {
    dedupeKey: conversationId ? `yelp:${conversationId}` : `gmail-thread:${gmailThreadId}`,
    dedupeFromYelp: Boolean(conversationId),
    customerName: customerName.slice(0, 512),
    projectName,
    projectDescription: sanitizeJobProjectDescription(
      projectName,
      redactDestructiveYelpUrls(lines.join('\n').trim()),
    ),
    leadEmail,
    phone,
    jobType,
    conversationId,
    threadUrl,
    serviceZip,
    survey,
    customerNotes,
  };
}
