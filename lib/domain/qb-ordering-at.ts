import { parseQboDateTime } from '@/lib/quickbooks/qbo-datetime';
import type { EstimateSnapshot, InvoiceSnapshot } from '@/lib/quickbooks/types';

/** Prefer MetaData.CreateTime, else transaction date on the document. */
export function estimateCreatedAtFromSnapshot(s: EstimateSnapshot): Date | undefined {
  return parseQboDateTime(s.metaCreateTime) ?? parseQboDateTime(s.txnDate);
}

export function invoiceCreatedAtFromSnapshot(s: InvoiceSnapshot): Date | undefined {
  return parseQboDateTime(s.metaCreateTime) ?? parseQboDateTime(s.txnDate);
}

/**
 * Board sort key: estimate creation in QBO wins when present (normal pipeline); else invoice creation.
 */
export function computeQbOrderingAt(params: {
  estimateCreatedAtQbo: Date | null | undefined;
  invoiceCreatedAtQbo: Date | null | undefined;
}): Date | null {
  const e = params.estimateCreatedAtQbo ?? null;
  const i = params.invoiceCreatedAtQbo ?? null;
  return e ?? i;
}
