import type { InvoiceSnapshot } from '@/lib/quickbooks/types';

type Props = {
  sectionId?: string;
  jobId: string;
  hasEstimate: boolean;
  hasInvoice: boolean;
  /** Only embed preview when live invoice loaded — avoids a broken iframe if QBO fetch failed */
  qboInvoice: InvoiceSnapshot | null;
};

export function TicketPdfSection({ sectionId, jobId, hasEstimate, hasInvoice, qboInvoice }: Props) {
  if (!hasInvoice && !hasEstimate) return null;

  const invoicePdfUrl = `/api/jobs/${jobId}/invoice-pdf`;
  const estimatePdfUrl = `/api/jobs/${jobId}/estimate-pdf`;

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Documents (QuickBooks PDF)</h2>
      <p className="meta ticket-doc-note">
        Live PDFs from QuickBooks — open in a new tab or preview below when connected.
      </p>
      <div className="ticket-doc-actions">
        {hasInvoice ? (
          <>
            <a className="btn btn-toolbar" href={invoicePdfUrl} target="_blank" rel="noopener noreferrer">
              Open invoice PDF
            </a>
            <a className="btn btn-toolbar btn-toolbar-muted" href={invoicePdfUrl} download>
              Download invoice PDF
            </a>
          </>
        ) : (
          <span className="meta">No invoice linked — PDF unavailable.</span>
        )}
        {hasEstimate ? (
          <>
            <a className="btn btn-toolbar" href={estimatePdfUrl} target="_blank" rel="noopener noreferrer">
              Open estimate PDF
            </a>
            <a className="btn btn-toolbar btn-toolbar-muted" href={estimatePdfUrl} download>
              Download estimate PDF
            </a>
          </>
        ) : null}
      </div>
      {hasInvoice && qboInvoice ? (
        <div className="ticket-pdf-preview">
          <p className="meta ticket-pdf-preview-label">Invoice preview</p>
          <iframe className="ticket-pdf-frame" title="Invoice PDF" src={invoicePdfUrl} />
        </div>
      ) : null}
    </section>
  );
}
