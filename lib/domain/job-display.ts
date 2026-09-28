import type { Job } from '@prisma/client';

export type JobHeadingFields = Pick<Job, 'projectName'> & {
  customerName?: string | null;
  projectDescription?: string | null;
};

export function docRefFromProjectName(projectName: string): string | null {
  const est = projectName.match(/^Estimate\s+#?\s*(.+)$/i);
  if (est) return est[1].trim();
  const inv = projectName.match(/^Invoice\s+#?\s*(.+)$/i);
  if (inv) return inv[1].trim();
  return null;
}

/** True when projectName is a QBO-style "Estimate #1263" / "Invoice #88" label. */
export function looksLikeQboDocProjectName(projectName: string): boolean {
  return docRefFromProjectName(projectName) != null;
}

const GENERIC_PROJECT_NAMES = new Set(
  [
    'website / form lead',
    'conversation / sms lead',
    'conversation lead',
    'form lead',
    'voice call',
    'email lead',
  ].map((s) => s.toLowerCase()),
);

/** Inbound webhook placeholders — not a shop-chosen ticket title. */
export function isGenericProjectLabel(name: string | null | undefined): boolean {
  const n = name?.trim().toLowerCase();
  if (!n) return true;
  if (GENERIC_PROJECT_NAMES.has(n)) return true;
  if (/^voice call\s*[—–-]/i.test(name!.trim())) return true;
  return false;
}

/** True when projectName is a shop-facing title (not Estimate/Invoice # and not a lead placeholder). */
export function isShopTicketTitle(projectName: string | null | undefined): boolean {
  const t = projectName?.trim();
  if (!t) return false;
  if (looksLikeQboDocProjectName(t)) return false;
  if (isGenericProjectLabel(t)) return false;
  return true;
}

/**
 * Keep a shop ticket label when a later QBO sync only has Estimate/Invoice #N.
 * Never replace an existing title with a QBO doc name.
 */
export function preferHumanProjectName(existing: string | null | undefined, incoming: string): string {
  const cur = existing?.trim();
  const inc = (incoming ?? '').trim();
  if (cur && looksLikeQboDocProjectName(inc)) {
    return cur;
  }
  if (inc && isShopTicketTitle(inc) && (!cur || looksLikeQboDocProjectName(cur) || isGenericProjectLabel(cur))) {
    return inc;
  }
  if (cur) return cur;
  return inc || incoming;
}

/**
 * Returns null if `desc` is empty or only repeats the estimate/invoice doc (common QBO line defaults).
 */
export function sanitizeJobProjectDescription(
  projectName: string,
  desc: string | null | undefined,
): string | null {
  const t = desc?.trim();
  if (!t) return null;
  if (isRedundantDocSubtitle(projectName, t)) return null;
  return t;
}

function isRedundantDocSubtitle(projectName: string, desc: string): boolean {
  const d = desc.replace(/\s+/g, ' ').trim();
  const canonical = jobDisplayTitle({ projectName }).replace(/\s+/g, ' ').trim();
  if (d.toLowerCase() === canonical.toLowerCase()) return true;

  const ref = docRefFromProjectName(projectName);
  if (!ref) return false;
  const refCompact = ref.replace(/\s/g, '').toLowerCase();

  const mEst = /^estimate\s*#?\s*(.+)$/i.exec(d);
  if (mEst && mEst[1].replace(/\s/g, '').toLowerCase() === refCompact) return true;
  const mInv = /^invoice\s*#?\s*(.+)$/i.exec(d);
  if (mInv && mInv[1].replace(/\s/g, '').toLowerCase() === refCompact) return true;

  if (/^\d+$/.test(d) && d === ref.replace(/\s/g, '')) return true;
  return false;
}

/**
 * Job.projectName holds whatever sync wrote (often "Estimate 1263" from QBO DocNumber, or a real
 * project label from seed/demo). Normalize doc-style values to "Estimate #..." / "Invoice #..."
 * for labels where the full doc line is needed.
 */
export function jobDisplayTitle(job: Pick<Job, 'projectName'>): string {
  const { projectName } = job;
  const est = projectName.match(/^Estimate\s+#?\s*(.+)$/i);
  if (est) return `Estimate #${est[1].trim()}`;
  const inv = projectName.match(/^Invoice\s+#?\s*(.+)$/i);
  if (inv) return `Invoice #${inv[1].trim()}`;
  return projectName;
}

/** Card / ticket main title: shop title when set, else "Customer name #docRef" for QBO labels. */
export function jobPrimaryHeading(job: Pick<Job, 'customerName' | 'projectName'>): string {
  if (isShopTicketTitle(job.projectName)) return job.projectName.trim();
  const ref = docRefFromProjectName(job.projectName);
  if (ref) return `${job.customerName.trim()} #${ref}`;
  return job.customerName.trim();
}

/**
 * Gmail tickets store `Email:` / `Subject:` plus the message in `projectDescription`.
 * Card and header subtitles should stay a contact line; the body stays in Lead details.
 * Returns null when the text is not that email block.
 */
export function compactStoredEmailSubtitle(text: string | null | undefined): string | null {
  const trimmed = text?.replace(/\r\n/g, '\n').trim();
  if (!trimmed || !/^Email:\s*\S+@/im.test(trimmed)) return null;

  const lines = trimmed.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const emailLine = lines.find((line) => /^Email:\s*\S+@/i.test(line));
  if (!emailLine) return null;
  const email = emailLine.replace(/^Email:\s*/i, '').split(/\s+/)[0]?.replace(/[.,;]+$/, '') ?? '';
  if (!email.includes('@')) return null;

  const subjectLine = lines.find((line) => /^Subject:\s*\S/i.test(line));
  let subject = subjectLine?.replace(/^Subject:\s*/i, '').trim() ?? '';
  if (!subject && /\bSubject:\s*\S/i.test(emailLine)) {
    subject = emailLine.replace(/^.*?\bSubject:\s*/i, '').trim();
  }
  subject = subject.replace(/\s+/g, ' ').trim();
  if (subject && subject.toLowerCase() !== email.toLowerCase()) {
    return `${email} · ${subject}`;
  }
  return email;
}

/**
 * Board card line for inbound leads: contact + conversation snippet only, not the "Submitted fields" dump
 * (that block stays on the ticket for debugging / completeness).
 */
export function inboundCardSubtitleFromStoredDescription(desc: string): string {
  let t = desc.trim();
  const withRule = t.search(/\n-{2,}\nSubmitted fields:\s*/i);
  if (withRule !== -1) t = t.slice(0, withRule).trim();
  else {
    const nl = t.search(/\nSubmitted fields:\s*/i);
    if (nl !== -1) t = t.slice(0, nl).trim();
    else if (t.startsWith('Submitted fields:')) t = '';
    else {
      const k = t.indexOf('Submitted fields:');
      if (k !== -1) t = t.slice(0, k).trim();
    }
  }
  return t;
}

const INBOUND_DESC_SPLIT_PRIMARY = /\n\n---\n\n/;
const INBOUND_DESC_SPLIT_FALLBACK_NL = /\n---\n/;
/** GHL / chat payloads sometimes glue `---` on the same line before `Channel:`. */
const INBOUND_DESC_SPLIT_FALLBACK_INLINE = /\s+---\s+(?=(?:Channel|bot):)/i;

function isSubmittedFieldsSegment(s: string): boolean {
  return /^Submitted fields:/im.test(s.trim());
}

function isRecordingSegment(s: string): boolean {
  return /^Recording:/im.test(s.trim());
}

function isCrmSegment(s: string): boolean {
  return /^CRM:/im.test(s.trim());
}

/**
 * Splits `projectDescription` from inbound marketing webhooks: contact block, optional
 * conversation/transcript, Recording/CRM lines, then Submitted fields (see `buildInboundTicketDescription`).
 */
export function splitInboundStoredDescription(raw: string): {
  contactSummary: string;
  conversationTranscript: string | null;
  metaBlocks: string[];
  submittedFields: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { contactSummary: '', conversationTranscript: null, metaBlocks: [], submittedFields: null };
  }

  let parts: string[];
  if (INBOUND_DESC_SPLIT_PRIMARY.test(trimmed)) {
    parts = trimmed.split(INBOUND_DESC_SPLIT_PRIMARY).map((p) => p.trim()).filter((p) => p.length > 0);
  } else if (INBOUND_DESC_SPLIT_FALLBACK_NL.test(trimmed)) {
    parts = trimmed.split(INBOUND_DESC_SPLIT_FALLBACK_NL).map((p) => p.trim()).filter((p) => p.length > 0);
  } else {
    const m = trimmed.match(INBOUND_DESC_SPLIT_FALLBACK_INLINE);
    if (m && m.index != null && m.index > 0) {
      parts = [trimmed.slice(0, m.index).trim(), trimmed.slice(m.index + m[0].length).trim()].filter(
        (p) => p.length > 0,
      );
    } else {
      parts = [trimmed];
    }
  }

  if (parts.length <= 1) {
    return {
      contactSummary: trimmed,
      conversationTranscript: null,
      metaBlocks: [],
      submittedFields: null,
    };
  }

  const contactSummary = parts[0] ?? '';
  const metaBlocks: string[] = [];
  const convoChunks: string[] = [];
  let submittedFields: string | null = null;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (isSubmittedFieldsSegment(p)) {
      submittedFields = submittedFields ? `${submittedFields}\n\n---\n\n${p}` : p;
      continue;
    }
    if (isRecordingSegment(p) || isCrmSegment(p)) {
      metaBlocks.push(p);
      continue;
    }
    convoChunks.push(p);
  }

  const conversationTranscript =
    convoChunks.length > 0 ? convoChunks.join('\n\n---\n\n').trim() : null;

  return { contactSummary, conversationTranscript, metaBlocks, submittedFields };
}

export type InboundLeadCardDisplayParts = {
  synopsis: string;
  transcript: string | null;
  metaBlocks: string[];
};

/**
 * For inbound marketing cards: contact-only synopsis for the subtitle line, transcript/meta split out.
 * Returns null when the job is not an inbound lead kind.
 */
export function inboundLeadCardDisplayParts(
  job: Pick<Job, 'projectName' | 'projectDescription' | 'inboundLeadKind'>,
): InboundLeadCardDisplayParts | null {
  if (job.inboundLeadKind == null) return null;
  const full = sanitizeJobProjectDescription(job.projectName, job.projectDescription);
  if (!full) return null;

  const split = splitInboundStoredDescription(full);
  const synopsisRaw = split.contactSummary.trim();
  const synopsisStripped = inboundCardSubtitleFromStoredDescription(synopsisRaw).trim();
  const synopsis = synopsisStripped || synopsisRaw;

  const transcript = split.conversationTranscript?.trim() || null;
  const metaBlocks = split.metaBlocks;

  if (!transcript && metaBlocks.length === 0) {
    const legacy = inboundCardSubtitleFromStoredDescription(full).trim();
    if (!legacy) return null;
    return { synopsis: legacy, transcript: null, metaBlocks: [] };
  }

  return { synopsis: synopsis.trim() || synopsisRaw, transcript, metaBlocks };
}

/**
 * Second line: QuickBooks memo / line description (`projectDescription` from sync), else legacy
 * free-text `projectName` when it is not an Estimate/Invoice doc label.
 */
export function jobSecondaryHeading(job: JobHeadingFields): string | null {
  const desc = sanitizeJobProjectDescription(job.projectName, job.projectDescription);
  const compactEmail = compactStoredEmailSubtitle(desc);
  if (isShopTicketTitle(job.projectName)) {
    if (compactEmail) return compactEmail;
    if (desc && desc.toLowerCase() !== job.projectName.trim().toLowerCase()) return desc;
    const customer = job.customerName?.trim();
    if (customer && customer.toLowerCase() !== job.projectName.trim().toLowerCase()) return customer;
    return null;
  }
  if (compactEmail) return compactEmail;
  if (desc) return desc;
  const raw = job.projectName?.trim();
  if (!raw) return null;
  if (docRefFromProjectName(job.projectName)) {
    return null;
  }
  return raw;
}
