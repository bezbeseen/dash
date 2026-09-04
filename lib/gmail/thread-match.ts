import { isYelpProxyEmailAddress } from '@/lib/yelp/lead-email';

/**
 * Ranking for "which Gmail thread belongs to this ticket".
 *
 * Free of Gmail and Prisma imports on purpose: the rules that decide whether a thread is
 * safe to attach are exercised without credentials by `npm run verify:thread-matcher`.
 */

export type ThreadMatchSignal =
  | 'lead_email_address'
  | 'ticket_email_address'
  | 'subject_doc_ref'
  | 'subject_project_name'
  | 'customer_name';

/** Attaching the wrong customer's mail is worse than attaching nothing, so only address matches clear this. */
export const AUTO_LINK_MIN_SCORE = 90;
/** A second thread at or above this makes the best match ambiguous, so nothing is written. */
export const AMBIGUITY_MIN_SCORE = 60;
export const SUGGEST_MIN_SCORE = 30;

export const THREAD_MATCH_DEFAULT_LOOKBACK_DAYS = 180;
export const MAX_SUGGESTIONS = 5;

const SIGNAL_SCORE: Record<ThreadMatchSignal, number> = {
  lead_email_address: 95,
  ticket_email_address: 85,
  subject_doc_ref: 70,
  subject_project_name: 55,
  customer_name: 40,
};

const SIGNAL_LABEL: Record<ThreadMatchSignal, string> = {
  lead_email_address: 'lead email address from the inbound webhook',
  ticket_email_address: 'email address found on the ticket',
  subject_doc_ref: 'estimate / invoice number in the subject',
  subject_project_name: 'project name in the subject',
  customer_name: 'customer name only',
};

export function describeThreadMatchSignal(signal: ThreadMatchSignal): string {
  return SIGNAL_LABEL[signal];
}

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const EMAIL_RE_GLOBAL = new RegExp(EMAIL_RE.source, 'g');

export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const angled = /<([^<>]+)>/.exec(raw);
  const candidate = (angled ? angled[1] : raw).trim().replace(/^mailto:/i, '');
  const m = EMAIL_RE.exec(candidate);
  return m ? m[0].toLowerCase() : null;
}

/** Gmail ignores dots and `+tags`, so two spellings of one mailbox must compare equal. */
export function emailComparisonKey(address: string): string {
  const [localRaw = '', domainRaw = ''] = address.trim().toLowerCase().split('@');
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  let local = localRaw.split('+')[0] ?? localRaw;
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export type AddressEntry = { address: string; name: string };

/** Splits an RFC 5322 address header, keeping display names and ignoring commas inside quotes. */
export function parseAddressEntries(header: string | null | undefined): AddressEntry[] {
  if (!header) return [];
  const parts: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (const ch of header) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);

  const seen = new Set<string>();
  const out: AddressEntry[] = [];
  for (const part of parts) {
    const address = normalizeEmailAddress(part);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    const name = part
      .replace(/<[^<>]*>/g, ' ')
      .replace(/["']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ address, name: name.includes('@') ? '' : name });
  }
  return out;
}

export function parseAddressList(header: string | null | undefined): string[] {
  return parseAddressEntries(header).map((e) => e.address);
}

export function extractEmailAddressesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(EMAIL_RE_GLOBAL) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const a = raw.toLowerCase();
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/** Mailbox providers where sharing a domain with the shop means nothing. */
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'comcast.net',
  'cox.net',
  'sbcglobal.net',
]);

/** Senders that are a platform talking to the shop, never the customer. */
const VENDOR_DOMAINS = [
  'yelp.com',
  'google.com',
  'googleapis.com',
  'googleusercontent.com',
  'youtube.com',
  'intuit.com',
  'quickbooks.com',
  'stripe.com',
  'squareup.com',
  'paypal.com',
  'docusign.net',
  'slack.com',
  'linkedin.com',
  'facebookmail.com',
  'facebook.com',
  'instagram.com',
  'mailchimp.com',
  'constantcontact.com',
  'godaddy.com',
  'wix.com',
  'squarespace.com',
  'shopify.com',
  'indeed.com',
  'ziprecruiter.com',
  'nextdoor.com',
  'bbb.org',
  'resend.dev',
  'sentry.io',
  'vercel.com',
  'atlassian.net',
];

const AUTOMATED_LOCAL_PARTS =
  /^(?:no-?reply|do-?not-?reply|donotreply|noreply|reply|notification|notifications|notify|alert|alerts|automated|auto|mailer-daemon|postmaster|bounce|bounces|bounced|newsletter|marketing|unsubscribe|updates|no-response)$/;

export type ParticipantRole = 'own' | 'automated' | 'counterparty';

export type CounterpartyFilter = {
  ownAddresses: Set<string>;
  ownDomains: Set<string>;
};

function domainOf(address: string): string {
  return address.split('@')[1] ?? '';
}

function domainMatches(domain: string, target: string): boolean {
  return domain === target || domain.endsWith(`.${target}`);
}

/**
 * Connected mailboxes define both the shop's own addresses and — when they sit on a private
 * domain — every other address on that domain (e.g. an unconnected `sales@` alias).
 */
export function buildCounterpartyFilter(mailboxEmails: readonly string[]): CounterpartyFilter {
  const ownAddresses = new Set<string>();
  const ownDomains = new Set<string>();
  for (const raw of mailboxEmails) {
    const addr = normalizeEmailAddress(raw);
    if (!addr) continue;
    ownAddresses.add(emailComparisonKey(addr));
    const domain = domainOf(addr);
    if (domain && !PUBLIC_MAIL_DOMAINS.has(domain)) ownDomains.add(domain);
  }
  return { ownAddresses, ownDomains };
}

export function classifyParticipant(rawAddress: string, filter: CounterpartyFilter): ParticipantRole {
  const address = normalizeEmailAddress(rawAddress);
  if (!address) return 'automated';
  if (filter.ownAddresses.has(emailComparisonKey(address))) return 'own';

  const domain = domainOf(address);
  for (const own of filter.ownDomains) {
    if (domainMatches(domain, own)) return 'own';
  }

  const local = address.split('@')[0] ?? '';
  if (AUTOMATED_LOCAL_PARTS.test(local)) return 'automated';

  // Yelp's per-lead reply proxy is the customer; every other yelp.com sender is Yelp itself.
  if (isYelpProxyEmailAddress(address)) return 'counterparty';

  for (const vendor of VENDOR_DOMAINS) {
    if (domainMatches(domain, vendor)) return 'automated';
  }
  return 'counterparty';
}

export function selectCounterparties(
  addresses: readonly string[],
  filter: CounterpartyFilter,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const address = normalizeEmailAddress(raw);
    if (!address) continue;
    if (classifyParticipant(address, filter) !== 'counterparty') continue;
    const key = emailComparisonKey(address);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

const SUBJECT_PREFIX_RE = /^(?:\s*(?:re|fw|fwd|aw|sv|antw)\s*(?:\[\d+\])?\s*:\s*)+/i;

export function normalizeSubject(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.replace(/\s+/g, ' ').trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(SUBJECT_PREFIX_RE, '').trim();
  }
  return s;
}

/** Lowercase, punctuation-free form used for every text containment comparison. */
export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function docRefFromProjectName(projectName: string | null | undefined): string | null {
  if (!projectName) return null;
  const m = /^\s*(?:estimate|invoice|quote|est|inv)\s*#?\s*([A-Za-z0-9-]{2,})\s*$/i.exec(projectName);
  return m ? m[1] : null;
}

export type JobMatchProfile = {
  jobId: string;
  customerName: string;
  projectName: string;
  /** Seeded by the inbound webhooks — the strongest thing Dash knows about the customer. */
  leadAddresses: string[];
  /** Addresses scraped from the rest of the ticket (notes, description, QuickBooks billing email). */
  ticketAddresses: string[];
  docRef: string | null;
};

export type JobMatchProfileInput = {
  jobId: string;
  customerName: string;
  projectName: string;
  projectDescription?: string | null;
  linkedEmails?: readonly {
    fromAddr?: string | null;
    toAddr?: string | null;
    linkUrl?: string | null;
    notes?: string | null;
  }[];
  extraAddresses?: readonly string[];
};

export function buildJobMatchProfile(
  input: JobMatchProfileInput,
  filter: CounterpartyFilter,
): JobMatchProfile {
  const leadRaw: string[] = [];
  for (const link of input.linkedEmails ?? []) {
    leadRaw.push(...parseAddressList(link.fromAddr));
    leadRaw.push(...parseAddressList(link.toAddr));
  }

  const secondaryRaw: string[] = [...(input.extraAddresses ?? [])];
  for (const link of input.linkedEmails ?? []) {
    secondaryRaw.push(...extractEmailAddressesFromText(link.linkUrl));
    secondaryRaw.push(...extractEmailAddressesFromText(link.notes));
  }
  secondaryRaw.push(...extractEmailAddressesFromText(input.projectDescription));

  const leadAddresses = selectCounterparties(leadRaw, filter);
  const leadKeys = new Set(leadAddresses.map(emailComparisonKey));
  const ticketAddresses = selectCounterparties(secondaryRaw, filter).filter(
    (a) => !leadKeys.has(emailComparisonKey(a)),
  );

  return {
    jobId: input.jobId,
    customerName: input.customerName.trim(),
    projectName: input.projectName.trim(),
    leadAddresses,
    ticketAddresses,
    docRef: docRefFromProjectName(input.projectName),
  };
}

export type ThreadSearchStep = {
  signal: ThreadMatchSignal;
  query: string;
  /** Human-readable form of what this search is looking for. */
  label: string;
};

/** Gmail treats these as operators, so user text is stripped before it goes in a quoted phrase. */
function gmailPhrase(raw: string): string {
  return raw.replace(/["():{}\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function addressQuery(address: string, lookbackDays: number): string {
  return `(from:${address} OR to:${address} OR cc:${address}) newer_than:${lookbackDays}d -in:chats -in:drafts`;
}

export function buildThreadSearchPlan(
  profile: JobMatchProfile,
  opts: { lookbackDays?: number; maxSteps?: number; addressSignalsOnly?: boolean } = {},
): ThreadSearchStep[] {
  const lookbackDays = Math.min(Math.max(opts.lookbackDays ?? THREAD_MATCH_DEFAULT_LOOKBACK_DAYS, 1), 365);
  const maxSteps = Math.min(Math.max(opts.maxSteps ?? 6, 1), 12);
  const steps: ThreadSearchStep[] = [];

  for (const address of profile.leadAddresses) {
    steps.push({
      signal: 'lead_email_address',
      query: addressQuery(address, lookbackDays),
      label: `mail with ${address}`,
    });
  }
  for (const address of profile.ticketAddresses) {
    steps.push({
      signal: 'ticket_email_address',
      query: addressQuery(address, lookbackDays),
      label: `mail with ${address}`,
    });
  }

  if (!opts.addressSignalsOnly) {
    if (profile.docRef) {
      const ref = gmailPhrase(profile.docRef);
      if (ref) {
        steps.push({
          signal: 'subject_doc_ref',
          query: `subject:"${ref}" newer_than:${lookbackDays}d -in:chats -in:drafts`,
          label: `subject containing ${profile.docRef}`,
        });
      }
    } else {
      const phrase = gmailPhrase(profile.projectName);
      if (normalizeText(phrase).length >= 6) {
        steps.push({
          signal: 'subject_project_name',
          query: `subject:"${phrase}" newer_than:${lookbackDays}d -in:chats -in:drafts`,
          label: `subject containing "${phrase}"`,
        });
      }
    }

    const name = gmailPhrase(profile.customerName);
    if (normalizeText(name).split(' ').filter(Boolean).length >= 2) {
      steps.push({
        signal: 'customer_name',
        query: `"${name}" newer_than:${lookbackDays}d -in:chats -in:drafts`,
        label: `any mention of "${name}"`,
      });
    }
  }

  return steps.slice(0, maxSteps);
}

export type ThreadCandidate = {
  threadId: string;
  gmailConnectionId: string;
  mailboxEmail: string;
  subject: string;
  snippet: string;
  participants: readonly AddressEntry[];
  messageCount: number;
  lastMessageAt: string | null;
  foundBy: ThreadMatchSignal;
  foundByLabel: string;
};

export type ScoredThreadCandidate = ThreadCandidate & {
  score: number;
  signals: ThreadMatchSignal[];
  reasons: string[];
  counterparties: string[];
};

function containsToken(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

export function scoreThreadCandidate(
  profile: JobMatchProfile,
  candidate: ThreadCandidate,
  filter: CounterpartyFilter,
): ScoredThreadCandidate {
  const counterparties = selectCounterparties(
    candidate.participants.map((p) => p.address),
    filter,
  );

  const signals: ThreadMatchSignal[] = [];
  const reasons: string[] = [];

  if (counterparties.length === 0) {
    return {
      ...candidate,
      score: 0,
      signals,
      counterparties,
      reasons: ['No outside participant — only shop mailboxes and automated senders are on this thread.'],
    };
  }

  const counterpartyKeys = new Set(counterparties.map(emailComparisonKey));

  const leadHit = profile.leadAddresses.find((a) => counterpartyKeys.has(emailComparisonKey(a)));
  if (leadHit) {
    signals.push('lead_email_address');
    reasons.push(`Thread includes the ticket's lead address ${leadHit}.`);
  }

  const ticketHit = profile.ticketAddresses.find((a) => counterpartyKeys.has(emailComparisonKey(a)));
  if (ticketHit) {
    signals.push('ticket_email_address');
    reasons.push(`Thread includes ${ticketHit}, found on the ticket.`);
  }

  const subject = normalizeText(normalizeSubject(candidate.subject));

  if (profile.docRef) {
    const ref = normalizeText(profile.docRef);
    if (ref && containsToken(subject, ref)) {
      signals.push('subject_doc_ref');
      reasons.push(`Subject carries document number ${profile.docRef}.`);
    }
  } else {
    const project = normalizeText(profile.projectName);
    if (project.length >= 6 && subject.includes(project)) {
      signals.push('subject_project_name');
      reasons.push(`Subject contains the project name "${profile.projectName}".`);
    }
  }

  const customer = normalizeText(profile.customerName);
  if (customer.length >= 4) {
    const nameOnSubject = subject.includes(customer);
    const nameOnParticipant = candidate.participants.some(
      (p) => p.name && counterpartyKeys.has(emailComparisonKey(p.address)) && normalizeText(p.name).includes(customer),
    );
    if (nameOnSubject || nameOnParticipant) {
      signals.push('customer_name');
      reasons.push(
        nameOnParticipant
          ? `A participant is named "${profile.customerName}".`
          : `Subject mentions "${profile.customerName}".`,
      );
    }
  }

  if (signals.length === 0) {
    return {
      ...candidate,
      score: 0,
      signals,
      counterparties,
      reasons: ['Turned up in the search but nothing on the ticket matches this thread.'],
    };
  }

  const base = Math.max(...signals.map((s) => SIGNAL_SCORE[s]));
  const score = Math.min(signals.length > 1 ? base + 5 : base, 98);

  return { ...candidate, score, signals, counterparties, reasons };
}

export type ThreadMatchAction = 'auto_link' | 'suggest' | 'none';

export type ThreadMatchDecision = {
  action: ThreadMatchAction;
  best: ScoredThreadCandidate | null;
  suggestions: ScoredThreadCandidate[];
  reason: string;
};

function rank(candidates: readonly ScoredThreadCandidate[]): ScoredThreadCandidate[] {
  const byThread = new Map<string, ScoredThreadCandidate>();
  for (const c of candidates) {
    const existing = byThread.get(c.threadId);
    if (!existing || c.score > existing.score) byThread.set(c.threadId, c);
  }
  return [...byThread.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
  });
}

export function decideThreadMatch(candidates: readonly ScoredThreadCandidate[]): ThreadMatchDecision {
  const ranked = rank(candidates);
  const suggestions = ranked.filter((c) => c.score >= SUGGEST_MIN_SCORE).slice(0, MAX_SUGGESTIONS);

  if (ranked.length === 0) {
    return { action: 'none', best: null, suggestions: [], reason: 'No threads came back from Gmail.' };
  }

  const best = ranked[0];
  if (best.score < SUGGEST_MIN_SCORE) {
    return {
      action: 'none',
      best: null,
      suggestions: [],
      reason: 'Nothing scored high enough to be worth showing.',
    };
  }

  if (best.score < AUTO_LINK_MIN_SCORE) {
    return {
      action: 'suggest',
      best,
      suggestions,
      reason: `Best match rests on ${describeThreadMatchSignal(best.signals[0])}, which is too weak to attach on its own.`,
    };
  }

  const rival = ranked.find((c) => c.threadId !== best.threadId && c.score >= AMBIGUITY_MIN_SCORE);
  if (rival) {
    return {
      action: 'suggest',
      best,
      suggestions,
      reason: `${ranked.filter((c) => c.score >= AMBIGUITY_MIN_SCORE).length} threads match this customer, so picking one is a human call.`,
    };
  }

  return {
    action: 'auto_link',
    best,
    suggestions,
    reason: `Exactly one thread matches ${describeThreadMatchSignal(best.signals[0])}.`,
  };
}

/** Compact form persisted in ActivityLog.metadata so the ticket can offer one-click accept. */
export type StoredThreadSuggestion = {
  threadId: string;
  gmailConnectionId: string;
  mailboxEmail: string;
  subject: string;
  counterparties: string[];
  lastMessageAt: string | null;
  messageCount: number;
  score: number;
  signals: ThreadMatchSignal[];
  reasons: string[];
};

export function toStoredThreadSuggestion(c: ScoredThreadCandidate): StoredThreadSuggestion {
  return {
    threadId: c.threadId,
    gmailConnectionId: c.gmailConnectionId,
    mailboxEmail: c.mailboxEmail,
    subject: c.subject.slice(0, 300),
    counterparties: c.counterparties.slice(0, 6),
    lastMessageAt: c.lastMessageAt,
    messageCount: c.messageCount,
    score: c.score,
    signals: c.signals,
    reasons: c.reasons.slice(0, 4),
  };
}

const KNOWN_SIGNALS = new Set<string>(Object.keys(SIGNAL_SCORE));

function stringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, cap);
}

/** ActivityLog.metadata is untyped JSON; read it back defensively. */
export function parseStoredThreadSuggestions(value: unknown): StoredThreadSuggestion[] {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).candidates
      : null;
  if (!Array.isArray(raw)) return [];

  const out: StoredThreadSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const threadId = typeof rec.threadId === 'string' ? rec.threadId : '';
    const gmailConnectionId = typeof rec.gmailConnectionId === 'string' ? rec.gmailConnectionId : '';
    if (!threadId || !gmailConnectionId) continue;
    out.push({
      threadId,
      gmailConnectionId,
      mailboxEmail: typeof rec.mailboxEmail === 'string' ? rec.mailboxEmail : '',
      subject: typeof rec.subject === 'string' ? rec.subject : '',
      counterparties: stringArray(rec.counterparties, 6),
      lastMessageAt: typeof rec.lastMessageAt === 'string' ? rec.lastMessageAt : null,
      messageCount: typeof rec.messageCount === 'number' ? rec.messageCount : 0,
      score: typeof rec.score === 'number' ? rec.score : 0,
      signals: stringArray(rec.signals, 5).filter((s): s is ThreadMatchSignal => KNOWN_SIGNALS.has(s)),
      reasons: stringArray(rec.reasons, 4),
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
