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
    case InboundLeadKind.VOICE_CALL:
      return 'Voice';
    default: {
      const _n: never = kind;
      return _n;
    }
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
    case InboundLeadKind.VOICE_CALL:
      return 'voice / AI call summary';
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

/** Card / header badge pill (Bootstrap subtle + border). */
export function inboundLeadKindPillClassName(kind: InboundLeadKind): string {
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'bg-primary-subtle text-primary-emphasis border-primary-subtle';
    case InboundLeadKind.CONVERSATION:
      return 'bg-info-subtle text-info-emphasis border-info-subtle';
    case InboundLeadKind.VOICE_CALL:
      return 'bg-secondary-subtle text-secondary-emphasis border-secondary-subtle';
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

export function inboundLeadKindDetailLabel(kind: InboundLeadKind): string {
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'Form submission';
    case InboundLeadKind.CONVERSATION:
      return 'Conversation';
    case InboundLeadKind.VOICE_CALL:
      return 'Voice call';
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

export function inboundLeadKindTitleAttr(kind: InboundLeadKind): string {
  switch (kind) {
    case InboundLeadKind.FORM:
      return 'Lead source: form submission webhook';
    case InboundLeadKind.CONVERSATION:
      return 'Lead source: conversation webhook';
    case InboundLeadKind.VOICE_CALL:
      return 'Lead source: voice / AI call summary';
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}
