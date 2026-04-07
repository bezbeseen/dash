import { BoardStatus, EstimateStatus, InvoiceStatus, ProductionStatus } from '@prisma/client';
import type { InvoiceSnapshot } from '@/lib/quickbooks/types';

type JobLike = {
  estimateStatus: EstimateStatus;
  productionStatus: ProductionStatus;
  invoiceStatus: InvoiceStatus;
  amountPaidCents?: number;
  invoiceAmountCents?: number;
  /** If set but invoiceStatus is still NONE (stale sync), keep invoice on the board. */
  quickbooksInvoiceId?: string | null;
};

/** Allow 1¢ slack so rounding never blocks “Paid” on the board. */
const PAID_SLACK_CENTS = 1;

export function deriveBoardStatus(job: JobLike): BoardStatus {
  const amountPaid = job.amountPaidCents ?? 0;
  const invoiceAmount = job.invoiceAmountCents ?? 0;

  const paidByAmount =
    invoiceAmount > 0 && amountPaid + PAID_SLACK_CENTS >= invoiceAmount;

  if (job.invoiceStatus === InvoiceStatus.PAID || paidByAmount) {
    return BoardStatus.PAID;
  }

  if (job.productionStatus === ProductionStatus.DELIVERED) {
    return BoardStatus.DELIVERED;
  }

  // Shop floor beats “has open invoice”: staff can be in Production/Ready while an invoice exists.
  if (job.productionStatus === ProductionStatus.READY) {
    return BoardStatus.READY;
  }

  if (job.productionStatus === ProductionStatus.IN_PROGRESS) {
    return BoardStatus.PRODUCTION;
  }

  // Invoice exists but not yet in production / ready / delivered flow above
  if (job.invoiceStatus === InvoiceStatus.OPEN || job.invoiceStatus === InvoiceStatus.DRAFT) {
    return BoardStatus.INVOICED;
  }

  if (job.estimateStatus === EstimateStatus.ACCEPTED) {
    return BoardStatus.APPROVED;
  }

  // Only a sent estimate opens the sales pipeline on the board; draft / unknown / rejected stay "lead".
  if (job.estimateStatus === EstimateStatus.SENT) {
    return BoardStatus.QUOTED;
  }

  // Invoice-only or bad enum mapping: linked invoice exists but status did not map to OPEN/DRAFT/PAID.
  if (job.quickbooksInvoiceId && job.invoiceStatus === InvoiceStatus.NONE) {
    return BoardStatus.INVOICED;
  }

  return BoardStatus.REQUESTED;
}

function snapshotInvoiceToEnum(s: InvoiceSnapshot['status']): InvoiceStatus {
  switch (s) {
    case 'PAID':
      return InvoiceStatus.PAID;
    case 'OPEN':
      return InvoiceStatus.OPEN;
    case 'DRAFT':
      return InvoiceStatus.DRAFT;
    case 'VOID':
      return InvoiceStatus.VOID;
    default:
      return InvoiceStatus.NONE;
  }
}

/**
 * Ticket header: prefer live GET invoice (accurate balance) over last bulk-sync row.
 */
export function boardStatusForTicketHeader(
  job: Pick<
    JobLike,
    | 'estimateStatus'
    | 'productionStatus'
    | 'invoiceStatus'
    | 'invoiceAmountCents'
    | 'amountPaidCents'
    | 'quickbooksInvoiceId'
  >,
  liveInvoice: InvoiceSnapshot | null,
): BoardStatus {
  if (!liveInvoice) {
    return deriveBoardStatus(job);
  }
  return deriveBoardStatus({
    estimateStatus: job.estimateStatus,
    productionStatus: job.productionStatus,
    invoiceStatus: snapshotInvoiceToEnum(liveInvoice.status),
    invoiceAmountCents: liveInvoice.totalAmtCents,
    amountPaidCents: liveInvoice.amountPaidCents,
    quickbooksInvoiceId: job.quickbooksInvoiceId,
  });
}
