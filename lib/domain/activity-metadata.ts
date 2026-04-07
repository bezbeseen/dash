import { fmtQboWhen } from '@/lib/ticket/format';

/** Same sentinel as fmtQboWhen when input is empty (Unicode em dash). */
const EM_DASH = '\u2014';

/** Estimate/invoice sync rows store QBO snapshot JSON on `metadata` with `txnDate`. */
export function qbEventDateLabelFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const txn = (metadata as Record<string, unknown>).txnDate;
  if (typeof txn !== 'string' || !txn.trim()) return null;
  const formatted = fmtQboWhen(txn);
  if (!formatted || formatted === EM_DASH) return null;
  return formatted;
}
