import { InvoiceStatus } from '@prisma/client';
import type { InvoiceSnapshot } from '@/lib/quickbooks/types';
import {
  BOARD_PAID_SLACK_CENTS,
  invoiceSnapshotEffectivelyPaid,
} from '@/lib/domain/derive-board-status';

export type JobPaidLike = {
  archivedAt?: Date | null;
  invoiceStatus: InvoiceStatus;
  invoiceAmountCents: number;
  amountPaidCents: number;
  prodWrapUpNotes?: string | null;
  prodWrapUpAt?: Date | null;
};

/** True once wrap-up was saved (with or without notes) or legacy rows with notes only. */
export function jobWrapUpRecorded(job: {
  prodWrapUpNotes?: string | null;
  prodWrapUpAt?: Date | null;
}): boolean {
  return Boolean((job.prodWrapUpNotes ?? '').trim()) || job.prodWrapUpAt != null;
}

/** Same rule as the board Paid column — works on last-sync Job row only. */
export function jobStoredRowLooksPaid(job: JobPaidLike): boolean {
  if (job.archivedAt) return false;
  const inv = job.invoiceAmountCents ?? 0;
  const paid = job.amountPaidCents ?? 0;
  const paidByAmount = inv > 0 && paid + BOARD_PAID_SLACK_CENTS >= inv;
  return job.invoiceStatus === InvoiceStatus.PAID || paidByAmount;
}

/**
 * True when the ticket is still on the board, not yet wrapped up, and fully paid (live invoice
 * snapshot when present, else last-sync row).
 */
export function jobNeedsWrapUpReminder(
  ctx: JobPaidLike,
  liveInvoice: Pick<InvoiceSnapshot, 'status' | 'totalAmtCents' | 'amountPaidCents'> | null,
): boolean {
  if (ctx.archivedAt) return false;
  if (ctx.prodWrapUpAt != null) return false;
  if ((ctx.prodWrapUpNotes ?? '').trim()) return false;
  if (liveInvoice && invoiceSnapshotEffectivelyPaid(liveInvoice)) return true;
  return jobStoredRowLooksPaid(ctx);
}
