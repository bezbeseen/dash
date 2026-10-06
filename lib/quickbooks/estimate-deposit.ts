import { fetchEstimatePdf } from '@/lib/quickbooks/client';
import { extractPdfTextRuns } from '@/lib/quickbooks/pdf-text';
import type { EstimateSnapshot } from '@/lib/quickbooks/types';

/**
 * QuickBooks' "Deposit request" on an estimate is not in the Accounting API (not on Estimate,
 * not in Preferences). The only read-only trace is the rendered PDF, which prints
 * "Deposit due $X" (or "Deposit paid $X") under the total.
 */

/** Start of the PrivateNote Dash writes on estimates made by Gmail Create ticket. */
export const GMAIL_ESTIMATE_NOTE_MARKER = 'Created from Gmail in Dash';

const MONEY_LINE = /^-?\$?\s?[\d,]+\.\d{2}$/;

/** True/false from the PDF's text runs; null when the text does not look like an estimate. */
export function pdfTextShowsDepositRequest(runs: readonly string[]): boolean | null {
  const lines = runs.map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.some((l) => /^total\b/i.test(l))) return null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^deposit\s+(due|paid|requested)\b/i.test(line)) return true;
    if (/^deposit:?$/i.test(line)) {
      const next = lines[i + 1] ?? '';
      if (/^(due|paid|requested)\b/i.test(next) || MONEY_LINE.test(next)) return true;
    }
  }
  return false;
}

export function estimateCameFromGmail(estimate: Pick<EstimateSnapshot, 'privateNote'>): boolean {
  return Boolean(estimate.privateNote?.includes(GMAIL_ESTIMATE_NOTE_MARKER));
}

/** Pending / Accepted only — Closed, Converted (invoiced) and Rejected no longer need a deposit. */
export function estimateOpenForDeposit(estimate: Pick<EstimateSnapshot, 'qboTxnStatus'>): boolean {
  const s = (estimate.qboTxnStatus ?? '').toLowerCase();
  return s === '' || s === 'pending' || s === 'accepted';
}

/** Downloads the estimate PDF. Null (logged) on any fetch or parse failure — never a guess. */
export async function fetchEstimateHasDepositRequest(
  realmId: string,
  estimateId: string,
): Promise<boolean | null> {
  try {
    const pdf = Buffer.from(await fetchEstimatePdf(realmId, estimateId));
    const runs = extractPdfTextRuns(pdf);
    const result = runs ? pdfTextShowsDepositRequest(runs) : null;
    if (result == null) console.warn('[quickbooks] estimate PDF text not readable for deposit check', estimateId);
    return result;
  } catch (e) {
    console.warn('[quickbooks] estimate PDF deposit check failed', estimateId, e);
    return null;
  }
}
