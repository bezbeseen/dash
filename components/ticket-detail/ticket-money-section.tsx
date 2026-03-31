import type { EstimateStatus, InvoiceStatus } from '@prisma/client';
import type { InvoiceSnapshot } from '@/lib/quickbooks/types';
import { fmtUsd, labelEnum } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  estimateAmountCents: number;
  estimateStatus: EstimateStatus;
  invoiceStatus: InvoiceStatus;
  invoiceTotalDisplayCents: number;
  paidDisplayCents: number;
  qboInvoice: InvoiceSnapshot | null;
};

export function TicketMoneySection({
  sectionId,
  estimateAmountCents,
  estimateStatus,
  invoiceStatus,
  invoiceTotalDisplayCents,
  paidDisplayCents,
  qboInvoice,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Money</h2>
      {qboInvoice ? (
        <p className="meta" style={{ marginBottom: 12 }}>
          Invoice line uses <strong>live QuickBooks</strong> (GET) so paid balance matches QBO even before the
          next board sync.
        </p>
      ) : null}
      <dl className="detail-kv">
        <dt>Estimate</dt>
        <dd>{fmtUsd(estimateAmountCents)}</dd>
        <dt>Invoice total</dt>
        <dd>{fmtUsd(invoiceTotalDisplayCents)}</dd>
        <dt>Paid</dt>
        <dd>{fmtUsd(paidDisplayCents)}</dd>
        <dt>Estimate status</dt>
        <dd>{labelEnum(estimateStatus)}</dd>
        <dt>Invoice status</dt>
        <dd>{qboInvoice ? labelEnum(qboInvoice.status) : labelEnum(invoiceStatus)}</dd>
      </dl>
    </section>
  );
}
