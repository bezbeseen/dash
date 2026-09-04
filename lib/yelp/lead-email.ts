import { sanitizeJobProjectDescription } from '@/lib/domain/job-display';

/**
 * Parses Yelp "new lead / new message" notification emails into pre-quote ticket fields.
 *
 * Dash cannot use the Yelp Leads API (it is gated to advertising resellers with a minimum
 * spend), so the mailbox that receives Yelp notifications is the ingest path instead. Yelp
 * changes these templates periodically, so every field is optional and the cleaned email
 * body is always kept verbatim in the description.
 */

export type ParsedYelpLeadEmail = {
  /** Stable key for Job.yelpLeadId. Real Yelp id when present, else the Gmail thread. */
  dedupeKey: string;
  /** True when dedupeKey came from a Yelp URL rather than the Gmail thread id. */
  dedupeFromYelp: boolean;
  customerName: string;
  projectName: string;
  projectDescription: string | null;
  leadEmail: string | null;
  phone: string | null;
  jobType: string | null;
  threadUrl: string | null;
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

/** biz.yelp.com messaging/lead links carry the ids we can dedupe on. */
function extractYelpIds(body: string): { leadId: string | null; threadUrl: string | null } {
  const patterns = [
    /https?:\/\/[^\s"'<>]*biz\.yelp\.com\/messaging\/[A-Za-z0-9_-]+\/thread\/([A-Za-z0-9_-]{8,})/i,
    /https?:\/\/[^\s"'<>]*biz\.yelp\.com\/leads[_-]?center\/[^\s"'<>]*?\/([A-Za-z0-9_-]{8,})/i,
    /https?:\/\/[^\s"'<>]*yelp\.com\/[^\s"'<>]*(?:lead_id|thread_id|conversation_id)=([A-Za-z0-9_-]{8,})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(body);
    if (m) {
      return { leadId: m[1], threadUrl: m[0] };
    }
  }
  const anyThread = /https?:\/\/[^\s"'<>]*biz\.yelp\.com\/(?:messaging|leads)[^\s"'<>]*/i.exec(body);
  return { leadId: null, threadUrl: anyThread ? anyThread[0] : null };
}

function firstMatch(body: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(body);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function extractCustomerName(subject: string, body: string): string | null {
  const fromSubject = firstMatch(subject, [
    /^(?:new\s+)?(?:quote\s+request|lead|message)\s+from\s+(.+?)\s*$/i,
    /^(.+?)\s+(?:sent\s+you|requested|wants|is\s+interested|replied)/i,
    /^you\s+have\s+a\s+new\s+(?:lead|quote\s+request|message)\s+from\s+(.+?)\s*$/i,
  ]);
  // Yelp shows consumers as "Jane D." — keep a trailing last-initial period, drop other punctuation.
  if (fromSubject) {
    const trimmed = fromSubject.replace(/!+$/, '').trim();
    return (/\s[A-Z]\.$/.test(trimmed) ? trimmed : trimmed.replace(/\.+$/, '')).trim();
  }

  return firstMatch(body, [
    /^\s*(?:customer|consumer|name|from|lead)\s*[:\-]\s*(.+?)\s*$/im,
    /^\s*(.{2,60}?)\s+(?:sent\s+you\s+a|requested\s+a\s+quote|is\s+requesting)/im,
  ]);
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

function extractJobType(subject: string, body: string): string | null {
  return (
    firstMatch(body, [
      /^\s*(?:job|job\s*type|project|service|category|requested\s+service)\s*[:\-]\s*(.+?)\s*$/im,
      /(?:looking\s+for|interested\s+in|needs?)\s+(?:a\s+|an\s+|some\s+)?([a-z0-9][^.\n!?]{3,60})/i,
    ]) ??
    firstMatch(subject, [/(?:quote\s+request|lead)\s+(?:for|about)\s+(.+?)\s*$/i])
  );
}

/** Drops Yelp's legal/marketing footer so the ticket body stays readable. */
export function stripYelpEmailBoilerplate(body: string): string {
  const cutMarkers = [
    /^\s*(?:--+\s*)?(?:this\s+(?:email|message)\s+was\s+sent\s+(?:to|by))/im,
    /^\s*(?:you\s+(?:are\s+)?receiv(?:ed|ing)\s+this\s+email)/im,
    /^\s*unsubscribe\b/im,
    /^\s*(?:©|\(c\)|copyright)\s*\d{4}\s*yelp/im,
    /^\s*yelp\s+inc\.?\s*,?\s*\d+/im,
    /^\s*manage\s+(?:your\s+)?(?:email\s+)?(?:notification\s+)?(?:preferences|settings)/im,
    /^\s*download\s+the\s+yelp\s+(?:for\s+business\s+)?app/im,
  ];
  let cut = body.length;
  for (const re of cutMarkers) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  return body
    .slice(0, cut)
    .replace(/https?:\/\/\S{120,}/g, '[link]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseYelpLeadEmail(input: {
  subject: string;
  body: string;
  gmailThreadId: string;
  receivedAt: Date | null;
}): ParsedYelpLeadEmail {
  const { subject, body, gmailThreadId } = input;

  const { leadId, threadUrl } = extractYelpIds(body);
  const cleanBody = stripYelpEmailBoilerplate(body);

  const customerName = extractCustomerName(subject, cleanBody) ?? 'Yelp lead';
  const jobType = extractJobType(subject, cleanBody);
  const phone = extractPhone(cleanBody);
  const leadEmail = extractEmail(cleanBody);

  const projectName = `Yelp · ${jobType ?? 'Request a Quote'}`.slice(0, 512);

  const lines: string[] = ['Source: Yelp (lead notification email)'];
  if (subject.trim()) lines.push(`Subject: ${subject.trim().slice(0, 300)}`);
  if (input.receivedAt) lines.push(`Received: ${input.receivedAt.toISOString()}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (leadEmail) lines.push(`Reply to: ${leadEmail}`);
  if (threadUrl) lines.push(`Yelp inbox: ${threadUrl.slice(0, 500)}`);
  if (cleanBody) {
    lines.push('');
    lines.push('Email body:');
    lines.push(cleanBody.slice(0, 8000));
  }

  return {
    dedupeKey: leadId ? `yelp:${leadId}` : `gmail-thread:${gmailThreadId}`,
    dedupeFromYelp: Boolean(leadId),
    customerName: customerName.slice(0, 512),
    projectName,
    projectDescription: sanitizeJobProjectDescription(projectName, lines.join('\n').trim()),
    leadEmail,
    phone,
    jobType,
    threadUrl,
  };
}
