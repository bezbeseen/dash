import type { ProductionStatus } from '@prisma/client';
import { fmtDetailDate, productionStatusDisplayLabel } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  productionStatus: ProductionStatus;
  startedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  paidAt: Date | null;
};

export function TicketProductionSection({
  sectionId,
  productionStatus,
  startedAt,
  readyAt,
  deliveredAt,
  paidAt,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Production</h2>
      <dl className="detail-kv">
        <dt>Production status</dt>
        <dd>{productionStatusDisplayLabel(productionStatus)}</dd>
        <dt>Started</dt>
        <dd>{fmtDetailDate(startedAt)}</dd>
        <dt>Ready</dt>
        <dd>{fmtDetailDate(readyAt)}</dd>
        <dt>Delivered / installed</dt>
        <dd>{fmtDetailDate(deliveredAt)}</dd>
        <dt>Paid (recorded)</dt>
        <dd>{fmtDetailDate(paidAt)}</dd>
      </dl>
    </section>
  );
}
