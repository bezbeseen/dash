import type { Job } from '@prisma/client';
import { InboundLeadKind } from '@prisma/client';
import {
  inboundCardSubtitleFromStoredDescription,
  inboundLeadCardDisplayParts,
  sanitizeJobProjectDescription,
  splitInboundStoredDescription,
} from '@/lib/domain/job-display';
import {
  formatPhoneDisplay,
  loadInboundPhoneRules,
  matchInboundPhoneRule,
  normalizePhoneDigits,
  type InboundPhoneRule,
} from '@/lib/domain/inbound-phone-rules';
import { isShopPlaceholderName } from '@/lib/domain/shop-name';

export { isShopPlaceholderName };

const GENERIC_PROJECT_NAMES = new Set(
  [
    'website / form lead',
    'conversation / sms lead',
    'conversation lead',
    'form lead',
    'voice call',
  ].map((s) => s.toLowerCase()),
);

function isGenericProjectLabel(name: string | null | undefined): boolean {
  const n = name?.trim().toLowerCase();
  if (!n) return true;
  if (GENERIC_PROJECT_NAMES.has(n)) return true;
  if (/^voice call\s*[—–-]/i.test(name!.trim())) return true;
  return false;
}

const PHONE_LINE_RE = /^Phone:\s*(.+)$/im;
const EMAIL_LINE_RE = /^Email:\s*(.+)$/im;

export function extractInboundPhoneRaw(
  job: Pick<Job, 'projectName' | 'projectDescription' | 'customerName'>,
): string | null {
  const raw = sanitizeJobProjectDescription(job.projectName, job.projectDescription) ?? '';
  const m = raw.match(PHONE_LINE_RE);
  if (m?.[1]?.trim()) return m[1].trim();

  const phoneRe = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
  const hit = raw.match(phoneRe);
  if (hit) return hit[0];

  const cn = job.customerName?.trim();
  if (cn && normalizePhoneDigits(cn)) return cn;

  return null;
}

function extractInboundEmail(
  job: Pick<Job, 'projectName' | 'projectDescription'>,
): string | null {
  const raw = sanitizeJobProjectDescription(job.projectName, job.projectDescription) ?? '';
  const m = raw.match(EMAIL_LINE_RE);
  return m?.[1]?.trim() ?? null;
}

function firstMeaningfulSnippet(
  job: Pick<Job, 'projectName' | 'projectDescription' | 'inboundLeadKind'>,
): string | null {
  const parts = inboundLeadCardDisplayParts(job);
  if (!parts) return null;

  const candidates = [parts.transcript, parts.synopsis].filter(Boolean) as string[];
  for (const block of candidates) {
    const lines = block
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      if (/^Phone:/i.test(line) || /^Email:/i.test(line) || /^Org:/i.test(line)) continue;
      if (/^(Customer|User|Agent|Bot|AI|Staff|You|Rep):/i.test(line)) {
        const msg = line.replace(/^(Customer|User|Agent|Bot|AI|Staff|You|Rep):\s*/i, '').trim();
        if (msg.length > 8) return msg.length > 120 ? `${msg.slice(0, 120).trimEnd()}…` : msg;
        continue;
      }
      if (line.length > 8 && !isShopPlaceholderName(line)) {
        return line.length > 120 ? `${line.slice(0, 120).trimEnd()}…` : line;
      }
    }
  }
  return null;
}

function inboundKindFallback(kind: InboundLeadKind): string {
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'Form lead';
    case InboundLeadKind.CONVERSATION:
      return 'Conversation';
    case InboundLeadKind.VOICE_CALL:
      return 'Voice call';
    case InboundLeadKind.YELP_LEAD:
      return 'Yelp lead';
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

export type LeadPrequoteCardDisplay = {
  title: string;
  subtitle: string | null;
  phoneDigits: string | null;
  phoneRule: InboundPhoneRule | null;
};

/**
 * Pre-quote / inbound card: prefer caller phone or message over shop name in GHL payloads.
 */
export function leadPrequoteCardDisplay(
  job: Pick<
    Job,
    | 'customerName'
    | 'projectName'
    | 'projectDescription'
    | 'inboundLeadKind'
    | 'createdAt'
  >,
): LeadPrequoteCardDisplay | null {
  if (job.inboundLeadKind == null) return null;

  const rules = loadInboundPhoneRules();
  const phoneRaw = extractInboundPhoneRaw(job);
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  const phoneRule = matchInboundPhoneRule(phoneDigits, rules);
  const email = extractInboundEmail(job);
  const snippet = firstMeaningfulSnippet(job);

  let title: string;
  const name = job.customerName?.trim() ?? '';
  const nameIsShop = isShopPlaceholderName(name);
  const nameLooksLikePhone = Boolean(name && normalizePhoneDigits(name));

  if (name && !nameIsShop && !nameLooksLikePhone) {
    title = name;
  } else if (phoneDigits) {
    title = formatPhoneDisplay(phoneDigits);
  } else if (email) {
    title = email;
  } else if (snippet) {
    title = snippet;
  } else if (name && !nameIsShop) {
    title = name;
  } else if (!isGenericProjectLabel(job.projectName)) {
    title = job.projectName.trim();
  } else {
    title = inboundKindFallback(job.inboundLeadKind);
  }

  let subtitle: string | null = snippet;
  if (subtitle && subtitle === title.replace(/^[^:]+:\s*/, '')) subtitle = null;
  if (!subtitle && nameIsShop && phoneDigits) {
    subtitle = `Listed as: ${name}`;
  }
  if (!subtitle && name && !nameIsShop && phoneDigits) {
    subtitle = formatPhoneDisplay(phoneDigits);
  }

  return { title, subtitle, phoneDigits, phoneRule };
}

/** Prefer phone or email over shop name when saving new webhook leads. */
export function resolveInboundCustomerName(
  body: Record<string, unknown>,
  composedName: string,
  projectDescription: string | null,
): string {
  const fakeJob = {
    customerName: composedName,
    projectName: '',
    projectDescription,
  };
  const phoneRaw = extractInboundPhoneRaw(fakeJob);
  const phoneDigits = normalizePhoneDigits(phoneRaw);

  if (isShopPlaceholderName(composedName)) {
    if (phoneDigits) return formatPhoneDisplay(phoneDigits).slice(0, 512);
    const email = extractInboundEmail(fakeJob);
    if (email) return email.slice(0, 512);
    return 'Unknown caller';
  }

  return composedName.slice(0, 512);
}
