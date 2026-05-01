import type { ProductionStatus } from '@prisma/client';
import { fmtDetailDate, fmtPlanHours, productionStatusDisplayLabel } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  productionStatus: ProductionStatus;
  startedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  paidAt: Date | null;
  prodPlanLaborHours: number | null;
  prodPlanMaterials: string | null;
  prodPlanClientCommHours: number | null;
  prodPlanDesignHours: number | null;
  prodWrapUpNotes: string | null;
  prodWrapUpAt: Date | null;
};

export function TicketProductionSection({
  sectionId,
  productionStatus,
  startedAt,
  readyAt,
  deliveredAt,
  paidAt,
  prodPlanLaborHours,
  prodPlanMaterials,
  prodPlanClientCommHours,
  prodPlanDesignHours,
  prodWrapUpNotes,
  prodWrapUpAt,
}: Props) {
  const hasPlan =
    prodPlanLaborHours != null ||
    (prodPlanMaterials != null && prodPlanMaterials.trim() !== '') ||
    prodPlanClientCommHours != null ||
    prodPlanDesignHours != null;
  const wrap = (prodWrapUpNotes ?? '').trim();

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
        {hasPlan ? (
          <>
            <dt>Est. labor (plan)</dt>
            <dd>{fmtPlanHours(prodPlanLaborHours)}</dd>
            <dt>Materials (plan)</dt>
            <dd className="ticket-prod-materials">{prodPlanMaterials?.trim() || '—'}</dd>
            <dt>Client comm — plan</dt>
            <dd>{fmtPlanHours(prodPlanClientCommHours)}</dd>
            <dt>Design time — plan</dt>
            <dd>{fmtPlanHours(prodPlanDesignHours)}</dd>
          </>
        ) : null}
        {wrap ? (
          <>
            <dt>Wrap-up recorded</dt>
            <dd className="text-body-secondary small">{fmtDetailDate(prodWrapUpAt)}</dd>
            <dt>What happened</dt>
            <dd className="text-break ticket-wrap-up-notes">{wrap}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}
