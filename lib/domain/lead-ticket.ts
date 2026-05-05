import type { Job } from '@prisma/client';
import { BoardStatus, InboundLeadKind } from '@prisma/client';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';

/**
 * True if the job has a real QuickBooks estimate or invoice (not a synthetic placeholder id).
 */
export function jobIsQuickBooksDocumentBacked(
  job: Pick<Job, 'quickbooksEstimateId' | 'quickbooksInvoiceId'>,
): boolean {
  const hasEstimate =
    Boolean(job.quickbooksEstimateId) && !isSyntheticQuickBooksId(job.quickbooksEstimateId);
  const hasInvoice =
    Boolean(job.quickbooksInvoiceId) && !isSyntheticQuickBooksId(job.quickbooksInvoiceId);
  return hasEstimate || hasInvoice;
}

/**
 * Pre-quote ticket with no linked QBO document — marketing webhooks, manual entry, etc.
 */
export function jobIsLeadFirstTicket(
  job: Pick<Job, 'boardStatus' | 'quickbooksEstimateId' | 'quickbooksInvoiceId'>,
): boolean {
  return job.boardStatus === BoardStatus.REQUESTED && !jobIsQuickBooksDocumentBacked(job);
}

/**
 * Inbound webhook lead still on the pre-quote lane — hide board production shortcuts until quoted / advanced.
 */
export function jobIsInboundMarketingRequested(
  job: Pick<Job, 'inboundLeadKind' | 'boardStatus'>,
): boolean {
  return job.inboundLeadKind != null && job.boardStatus === BoardStatus.REQUESTED;
}

/** Short label for badges and compact UI. */
export function inboundLeadKindShortLabel(kind: InboundLeadKind | null | undefined): string | null {
  if (kind == null) return null;
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'Form';
    case InboundLeadKind.CONVERSATION:
      return 'Conversation';
    default:
      return null;
  }
}

/** Longer phrase for sentences on the ticket (WEB uses Title Case for “Form submission”). */
export function inboundLeadKindPhrase(kind: InboundLeadKind | null | undefined): string | null {
  if (kind == null) return null;
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'form submission';
    case InboundLeadKind.CONVERSATION:
      return 'conversation webhook';
    default:
      return null;
  }
}
