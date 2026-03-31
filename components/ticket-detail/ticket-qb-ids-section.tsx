type Props = {
  sectionId?: string;
  realmId: string | null;
  customerId: string | null;
  estimateId: string | null;
  invoiceId: string | null;
};

export function TicketQuickBooksIdsSection({
  sectionId,
  realmId,
  customerId,
  estimateId,
  invoiceId,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">QuickBooks</h2>
      <dl className="detail-kv">
        <dt>Company (realm)</dt>
        <dd className="detail-mono">{realmId ?? '—'}</dd>
        <dt>Customer ID</dt>
        <dd className="detail-mono">{customerId ?? '—'}</dd>
        <dt>Estimate ID</dt>
        <dd className="detail-mono">{estimateId ?? '—'}</dd>
        <dt>Invoice ID</dt>
        <dd className="detail-mono">{invoiceId ?? '—'}</dd>
      </dl>
    </section>
  );
}
