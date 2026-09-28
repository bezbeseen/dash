import { EstimateStatus, InvoiceStatus } from '@prisma/client';
import { fmtUsd } from '@/lib/ticket/format';

export type QbMoneySnapshot = {
  estimateStatus: EstimateStatus;
  invoiceStatus: InvoiceStatus;
  estimateAmountCents: number;
  invoiceAmountCents: number;
  amountPaidCents: number;
  quickbooksEstimateId?: string | null;
  quickbooksInvoiceId?: string | null;
};

export type QbActivityLine = {
  eventName: string;
  message: string;
};

function estimateLabel(docNumber?: string | null, fallbackId?: string | null): string {
  const n = docNumber?.trim();
  if (n) return `Estimate #${n}`;
  if (fallbackId) return `Estimate ${fallbackId}`;
  return 'Estimate';
}

function invoiceLabel(docNumber?: string | null, fallbackId?: string | null): string {
  const n = docNumber?.trim();
  if (n) return `Invoice #${n}`;
  if (fallbackId) return `Invoice ${fallbackId}`;
  return 'Invoice';
}

export function invoicePaidInFull(
  m: Pick<QbMoneySnapshot, 'invoiceStatus' | 'invoiceAmountCents' | 'amountPaidCents'>,
): boolean {
  if (m.invoiceStatus === InvoiceStatus.PAID) return true;
  return m.invoiceAmountCents > 0 && m.amountPaidCents + 1 >= m.invoiceAmountCents;
}

/**
 * Activity lines for estimate/invoice/payment changes only — skip no-op QBO syncs.
 */
export function qbDocActivityEvents(opts: {
  prev: QbMoneySnapshot | null;
  next: QbMoneySnapshot;
  estimateDocNumber?: string | null;
  invoiceDocNumber?: string | null;
}): QbActivityLine[] {
  const { prev, next } = opts;
  const events: QbActivityLine[] = [];
  const estLabel = estimateLabel(opts.estimateDocNumber, next.quickbooksEstimateId);
  const invLabel = invoiceLabel(opts.invoiceDocNumber, next.quickbooksInvoiceId);

  const prevEstId = prev?.quickbooksEstimateId ?? null;
  const nextEstId = next.quickbooksEstimateId ?? null;
  const newEstimate = Boolean(nextEstId) && prevEstId !== nextEstId;
  const estimateStatusChanged =
    Boolean(nextEstId) && (!prev || prev.estimateStatus !== next.estimateStatus);

  if (newEstimate || estimateStatusChanged) {
    const st = next.estimateStatus.toLowerCase();
    if (newEstimate && !prevEstId) {
      events.push({
        eventName: `estimate.${st}`,
        message: `${estLabel} synced from QuickBooks.`,
      });
    } else {
      const verb =
        next.estimateStatus === EstimateStatus.SENT
          ? 'sent'
          : next.estimateStatus === EstimateStatus.ACCEPTED
            ? 'accepted'
            : next.estimateStatus === EstimateStatus.REJECTED
              ? 'rejected'
              : 'updated';
      events.push({
        eventName: `estimate.${st}`,
        message: `${estLabel} marked ${verb} in QuickBooks.`,
      });
    }
  }

  const prevInvId = prev?.quickbooksInvoiceId ?? null;
  const nextInvId = next.quickbooksInvoiceId ?? null;
  const newInvoice = Boolean(nextInvId) && prevInvId !== nextInvId;
  const prevPaid = prev?.amountPaidCents ?? 0;
  const paidDelta = next.amountPaidCents - prevPaid;
  const paymentReceived = Boolean(nextInvId) && paidDelta > 0;
  const invoiceStatusChanged =
    Boolean(nextInvId) && (!prev || prev.invoiceStatus !== next.invoiceStatus);

  if (paymentReceived) {
    const full = invoicePaidInFull(next);
    const wasFull = prev ? invoicePaidInFull(prev) : false;
    events.push({
      eventName: full && !wasFull ? 'invoice.paid' : 'invoice.payment',
      message: full
        ? `${invLabel} — payment received (${fmtUsd(paidDelta)}); paid in full.`
        : `${invLabel} — payment received (${fmtUsd(paidDelta)}). Paid ${fmtUsd(next.amountPaidCents)} of ${fmtUsd(next.invoiceAmountCents)}.`,
    });
  } else if (newInvoice || invoiceStatusChanged) {
    const st = next.invoiceStatus.toLowerCase();
    events.push({
      eventName: `invoice.${st}`,
      message:
        newInvoice && !prevInvId
          ? `${invLabel} synced from QuickBooks.`
          : `${invLabel} marked ${st} in QuickBooks.`,
    });
  }

  return events;
}
