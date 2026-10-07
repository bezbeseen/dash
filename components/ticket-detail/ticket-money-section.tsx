import type { EstimateStatus, InvoiceStatus } from '@prisma/client';
import type { EstimateSnapshot, InvoiceSnapshot } from '@/lib/quickbooks/types';
import { fmtUsd, labelEnum } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  estimateAmountCents: number;
  estimateStatus: EstimateStatus;
  invoiceStatus: InvoiceStatus;
  invoiceTotalDisplayCents: number;
  paidDisplayCents: number;
  depositCents?: number;
  invoiceBalanceDisplayCents: number;
  qboEstimate: EstimateSnapshot | null;
  qboInvoice: InvoiceSnapshot | null;
};

export function TicketMoneySection({
  sectionId,
  estimateAmountCents,
  estimateStatus,
  invoiceStatus,
  invoiceTotalDisplayCents,
  paidDisplayCents,
  depositCents = 0,
  invoiceBalanceDisplayCents,
  qboEstimate,
  qboInvoice,
}: Props) {
  const liveNote =
    qboEstimate || qboInvoice
      ? `Uses live QuickBooks ${[qboEstimate ? 'estimate' : null, qboInvoice ? 'invoice' : null]
          .filter(Boolean)
          .join(' and ')} so totals and deposits match QBO even before the next board sync.`
      : null;

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Money</h2>
      {liveNote ? (
        <p className="meta" style={{ marginBottom: 12 }}>
          {liveNote}
        </p>
      ) : null}
      <dl className="detail-kv">
        <dt>Estimate</dt>
        <dd>{fmtUsd(estimateAmountCents)}</dd>
        <dt>Invoice total</dt>
        <dd>{fmtUsd(invoiceTotalDisplayCents)}</dd>
        <dt>Paid on invoice</dt>
        <dd>{fmtUsd(paidDisplayCents)}</dd>
        {/* depositCents is this ticket's share of the customer's held deposit; once invoiced, it shows as paid on invoice. */}
        {depositCents > 0 && !qboInvoice && invoiceTotalDisplayCents === 0 ? (
          <>
            <dt>Deposit paid</dt>
            <dd>{fmtUsd(depositCents)}</dd>
          </>
        ) : null}
        <dt>Open on invoice</dt>
        <dd>{fmtUsd(invoiceBalanceDisplayCents)}</dd>
        <dt>Estimate status</dt>
        <dd>{labelEnum(estimateStatus)}</dd>
        <dt>Invoice status</dt>
        <dd>{qboInvoice ? labelEnum(qboInvoice.status) : labelEnum(invoiceStatus)}</dd>
      </dl>
    </section>
  );
}
