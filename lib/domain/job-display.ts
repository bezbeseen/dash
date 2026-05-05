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
