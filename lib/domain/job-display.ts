import type { Job } from '@prisma/client';

export type JobHeadingFields = Pick<Job, 'projectName'> & {
  projectDescription?: string | null;
};

function docRefFromProjectName(projectName: string): string | null {
  const est = projectName.match(/^Estimate\s+#?\s*(.+)$/i);
  if (est) return est[1].trim();
  const inv = projectName.match(/^Invoice\s+#?\s*(.+)$/i);
  if (inv) return inv[1].trim();
  return null;
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

/** Card / ticket main title: "Customer name #docRef" when projectName is an estimate or invoice line. */
export function jobPrimaryHeading(job: Pick<Job, 'customerName' | 'projectName'>): string {
  const ref = docRefFromProjectName(job.projectName);
  if (ref) return `${job.customerName.trim()} #${ref}`;
  return job.customerName.trim();
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
  if (desc) return desc;
  const raw = job.projectName?.trim();
  if (!raw) return null;
  if (docRefFromProjectName(job.projectName)) {
    return null;
  }
  return raw;
}
