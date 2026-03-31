import type { InvoiceSnapshot } from '@/lib/quickbooks/types';

type Props = {
  sectionId?: string;
  hasInvoice: boolean;
  qboInvoice: InvoiceSnapshot | null;
};

function mailtoInvoice(inv: InvoiceSnapshot) {
  if (!inv.billEmail) return null;
  const doc = inv.docNumber || inv.id;
  const subject = encodeURIComponent(`Invoice ${doc} — ${inv.customerName}`);
  return `mailto:${inv.billEmail}?subject=${subject}`;
}

export function TicketInvoiceEmailSection({ sectionId, hasInvoice, qboInvoice }: Props) {
  if (!hasInvoice) return null;

  if (qboInvoice) {
    const mail = mailtoInvoice(qboInvoice);
    return (
      <section id={sectionId} className="ticket-detail-panel">
        <h2 className="detail-section-title">Invoice email & correspondence</h2>
        <p className="meta ticket-doc-note">
          From QuickBooks on this invoice: billing “send to” address and messages. Full email history
          isn&apos;t available via the API — use your mail client or QBO for threads.
        </p>
        <dl className="detail-kv">
          <dt>Invoice #</dt>
          <dd>{qboInvoice.docNumber ?? qboInvoice.id}</dd>
          <dt>Txn date</dt>
          <dd>{qboInvoice.txnDate ?? '—'}</dd>
          <dt>Due date</dt>
          <dd>{qboInvoice.dueDate ?? '—'}</dd>
          <dt>Bill email</dt>
          <dd>
            {qboInvoice.billEmail ? (
              <a className="ticket-mailto" href={mail ?? `mailto:${qboInvoice.billEmail}`}>
                {qboInvoice.billEmail}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt>Bill email CC</dt>
          <dd>{qboInvoice.billEmailCc ?? '—'}</dd>
          <dt>Customer message</dt>
          <dd className="ticket-memo">{qboInvoice.customerMemo ?? '—'}</dd>
          <dt>Private note (QBO)</dt>
          <dd className="ticket-memo ticket-memo-internal">{qboInvoice.privateNote ?? '—'}</dd>
        </dl>
      </section>
    );
  }

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Invoice email & correspondence</h2>
      <p className="meta ticket-doc-note">
        Could not load invoice details from QuickBooks (try reconnecting or sync again). PDF links may still
        work if the invoice id is valid.
      </p>
    </section>
  );
}
