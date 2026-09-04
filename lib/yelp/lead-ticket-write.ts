import {
  BoardStatus,
  EstimateStatus,
  InboundLeadKind,
  InvoiceStatus,
  ProductionStatus,
  type Prisma,
} from '@prisma/client';
import type { ParsedYelpLeadEmail } from '@/lib/yelp/lead-email';

/**
 * Keys to look up an existing Job.yelpLeadId. Email imports store `yelp:<hex>`; the
 * gated Leads API webhook stores the bare id. Searching both keeps a re-scan from
 * duplicating Rose (or anyone else) whichever path wrote first.
 */
export function yelpLeadDedupeLookupKeys(
  parsed: Pick<ParsedYelpLeadEmail, 'dedupeKey' | 'dedupeFromYelp'>,
): string[] {
  const keys = [parsed.dedupeKey];
  if (parsed.dedupeFromYelp && parsed.dedupeKey.startsWith('yelp:')) {
    keys.push(parsed.dedupeKey.slice('yelp:'.length));
  }
  return keys;
}

/**
 * Pre-quote Yelp ticket fields. `createdAt` follows the email Date so a backfill of
 * April–July leads lands in Stale rather than New.
 */
export function yelpLeadEmailJobWriteData(
  parsed: ParsedYelpLeadEmail,
  receivedAt: Date | null,
): Prisma.JobCreateInput {
  return {
    customerName: parsed.customerName,
    projectName: parsed.projectName,
    projectDescription: parsed.projectDescription,
    inboundLeadKind: InboundLeadKind.YELP_LEAD,
    yelpLeadId: parsed.dedupeKey,
    boardStatus: BoardStatus.REQUESTED,
    productionStatus: ProductionStatus.NOT_STARTED,
    estimateStatus: EstimateStatus.UNKNOWN,
    invoiceStatus: InvoiceStatus.NONE,
    ...(receivedAt ? { createdAt: receivedAt } : {}),
  };
}
