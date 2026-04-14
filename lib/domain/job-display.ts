import type { Job } from '@prisma/client';

function docRefFromProjectName(projectName: string): string | null {
  const est = projectName.match(/^Estimate\s+#?\s*(.+)$/i);
  if (est) return est[1].trim();
  const inv = projectName.match(/^Invoice\s+#?\s*(.+)$/i);
  if (inv) return inv[1].trim();
  return null;
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
 * Second line under the card title: free-text project name for non-doc rows; for Estimate/Invoice
 * `projectName` lines the primary row is already `Customer #ref`, so we show the formatted doc title
 * (e.g. `Estimate #1263`) here instead of leaving the card one-line tall.
 */
export function jobSecondaryHeading(job: Pick<Job, 'projectName'>): string | null {
  const raw = job.projectName?.trim();
  if (!raw) return null;
  if (docRefFromProjectName(job.projectName)) {
    return jobDisplayTitle(job);
  }
  return raw;
}
