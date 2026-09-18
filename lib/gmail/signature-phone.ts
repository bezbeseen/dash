/**
 * Pull a US phone out of a Gmail signature (message body, not From/To headers).
 * Used when creating a ticket from a thread so QBO PrimaryPhone and the Dash
 * "Phone:" contact line can be filled without inventing numbers.
 */
import {
  formatPhoneDisplay,
  matchInboundPhoneRule,
  plausibleUsPhoneDigits,
} from '@/lib/domain/inbound-phone-rules';
import {
  buildCounterpartyFilter,
  classifyParticipant,
  parseAddressEntries,
  type CounterpartyFilter,
} from '@/lib/gmail/thread-match';

export type PhoneScanMessage = {
  from?: string;
  body?: string;
};

/** Optional +1 and required area code — 7-digit locals are too ambiguous. */
export const US_PHONE_CANDIDATE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

const SIGNATURE_DELIM_RE =
  /^(?:--\s*$|thanks?(?:\s+you)?[!.,]*$|thank\s+you[!.,]*$|sent\s+from\s+(?:my\s+)?iphone\b.*$|best(?:\s+regards)?[!.,]*$|regards[!.,]*$)/i;

function looksLikeJunkUsNumber(digits: string): boolean {
  if (digits.length !== 10) return true;
  if (new Set(digits).size < 3) return true;
  // NANP: area code and exchange (NXX) cannot start with 0 or 1.
  if (digits[0] === '0' || digits[0] === '1') return true;
  if (digits[3] === '0' || digits[3] === '1') return true;
  return false;
}

function isSkippedPhone(digits: string, shopDigits: ReadonlySet<string>): boolean {
  if (shopDigits.has(digits)) return true;
  if (looksLikeJunkUsNumber(digits)) return true;
  if (matchInboundPhoneRule(digits)) return true;
  return false;
}

/** Drop quoted history so the shop's own number in a reply quote is not treated as the customer's. */
export function stripQuotedReply(body: string): string {
  let text = body.replace(/\r\n?/g, '\n');
  const originalMsg = text.search(/\n-{2,}\s*Original Message\s*-{2,}/i);
  if (originalMsg >= 0) text = text.slice(0, originalMsg);
  const fromSent = text.search(/\nFrom:\s.+\nSent:\s/i);
  if (fromSent >= 0) text = text.slice(0, fromSent);

  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^>/.test(line)) continue;
    if (/^On\s[\s\S]{0,200}?wrote:\s*$/i.test(line.trim())) break;
    if (/^On\s+\w{3},?\s/.test(line.trim()) && lines.slice(i, i + 3).join(' ').includes('wrote:')) {
      break;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

function lastSignatureDelimiterIndex(lines: readonly string[]): number {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SIGNATURE_DELIM_RE.test(lines[i]!.trim())) found = i;
  }
  return found;
}

/** Last ~15 lines, plus the block after `--` / thanks / sent from iPhone when present. */
export function signatureIshRegion(body: string): string {
  const stripped = stripQuotedReply(body);
  if (!stripped) return '';
  const lines = stripped.split('\n');
  const last15 = lines.slice(-15).join('\n');
  const delim = lastSignatureDelimiterIndex(lines);
  if (delim >= 0) {
    return `${lines.slice(delim).join('\n')}\n${last15}`;
  }
  return last15;
}

function digitsFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const withoutFax = text
    .split('\n')
    .filter((line) => !/^\s*fax\b/i.test(line))
    .join('\n');
  const re = new RegExp(US_PHONE_CANDIDATE_RE.source, 'g');
  for (const m of withoutFax.matchAll(re)) {
    const digits = plausibleUsPhoneDigits(m[0]);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    found.push(digits);
  }
  return found;
}

function firstUsablePhone(text: string, shopDigits: ReadonlySet<string>): string | null {
  for (const digits of digitsFromText(text)) {
    if (isSkippedPhone(digits, shopDigits)) continue;
    return formatPhoneDisplay(digits);
  }
  return null;
}

export function extractSignaturePhoneFromText(
  body: string,
  shopDigits: ReadonlySet<string> = new Set(),
): string | null {
  const region = signatureIshRegion(body);
  return firstUsablePhone(region, shopDigits);
}

function fromIsRole(from: string | undefined, filter: CounterpartyFilter, role: 'own' | 'counterparty'): boolean {
  for (const entry of parseAddressEntries(from)) {
    if (classifyParticipant(entry.address, filter) === role) return true;
  }
  return false;
}

function fromHasAddress(from: string | undefined, email: string): boolean {
  const want = email.trim().toLowerCase();
  return parseAddressEntries(from).some((e) => e.address === want);
}

/**
 * Prefer the first inbound from the chosen counterparty. Shop/own numbers
 * (inbound phone rules + numbers in shop-sent signatures) are skipped.
 */
export function extractSignaturePhoneFromMessages(
  messages: readonly PhoneScanMessage[],
  mailboxEmails: readonly string[],
  customerEmail: string,
): string | null {
  const filter = buildCounterpartyFilter(mailboxEmails);
  const shopDigits = new Set<string>();
  for (const m of messages) {
    if (!m.body?.trim() || !fromIsRole(m.from, filter, 'own')) continue;
    for (const digits of digitsFromText(signatureIshRegion(m.body))) {
      shopDigits.add(digits);
    }
  }

  const inbound = messages.filter(
    (m) => m.body?.trim() && fromHasAddress(m.from, customerEmail),
  );
  for (const m of inbound) {
    const phone = extractSignaturePhoneFromText(m.body!, shopDigits);
    if (phone) return phone;
  }
  return null;
}
