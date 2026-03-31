import type { InvoiceSnapshot } from '@/lib/quickbooks/types';
import { TicketInvoiceEmailSection } from '@/components/ticket-detail/ticket-invoice-email-section';
import { TicketPdfSection } from '@/components/ticket-detail/ticket-pdf-section';

type Props = {
  jobId: string;
  hasEstimate: boolean;
  hasInvoice: boolean;
  qboInvoice: InvoiceSnapshot | null;
  pdfSectionId?: string;
  invoiceEmailSectionId?: string;
};

/** PDFs + invoice email blocks (composed from ticket-detail modules). */
export function TicketDocumentsSection({
  jobId,
  hasEstimate,
  hasInvoice,
  qboInvoice,
  pdfSectionId,
  invoiceEmailSectionId,
}: Props) {
  return (
    <>
      <TicketPdfSection
        sectionId={pdfSectionId}
        jobId={jobId}
        hasEstimate={hasEstimate}
        hasInvoice={hasInvoice}
        qboInvoice={qboInvoice}
      />
      <TicketInvoiceEmailSection
        sectionId={invoiceEmailSectionId}
        hasInvoice={hasInvoice}
        qboInvoice={qboInvoice}
      />
    </>
  );
}
