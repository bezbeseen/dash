/**
 * Counts for a Yelp lead-email scan. Every message gets exactly one outcome, so the
 * totals cannot overlap the way a single "skipped" number did.
 * Pure and credential-free: covered by `npm run verify:yelp-email-parser`.
 */

export type YelpEmailOutcome =
  /** Gmail returned an error for this message id. */
  | 'fetch_failed'
  /** From yelp.com but not a customer lead: ad report, review, newsletter, sales mail. */
  | 'not_a_lead'
  /** A lead Dash already has a ticket for. */
  | 'already_imported'
  /** A new lead a dry run would have imported. */
  | 'new_lead_preview'
  /** A new lead that became a ticket. */
  | 'ticket_created'
  /** A new lead whose ticket insert failed. */
  | 'create_failed';

import type { YelpRejectionCategory } from '@/lib/yelp/lead-classify';

export type YelpScanCounts = {
  /** Yelp messages the scan looked at. Equals the sum of the outcome buckets. */
  messagesExamined: number;
  /** Messages recognised as customer leads. */
  leadEmailsFound: number;
  /** Messages from Yelp that were not leads. */
  rejectedNotLeads: number;
  /** Why they were not leads, so a rejection never has to be guessed at. */
  rejectedByReason: Record<YelpRejectionCategory, number>;
  /** Leads that already had a ticket. */
  alreadyImported: number;
  /** Leads with no ticket yet. In a dry run these are the ones an import would create. */
  newLeadsFound: number;
  /** Tickets actually written. Always 0 in a dry run. */
  ticketsCreated: number;
  /** Messages Gmail would not return. */
  fetchFailed: number;
  /** New leads whose ticket insert failed. */
  createFailed: number;
};

const REJECTION_CATEGORIES: YelpRejectionCategory[] = [
  'not_yelp_sender',
  'consumer_marketing',
  'reply_to_our_own_request',
  'own_business_reply',
  'own_account_request',
  'not_lead_wording',
];

export function summarizeYelpScan(
  items: { outcome: YelpEmailOutcome; rejectionCategory?: YelpRejectionCategory | null }[],
): YelpScanCounts {
  const tally = (outcome: YelpEmailOutcome) => items.filter((i) => i.outcome === outcome).length;

  const rejectedByReason = Object.fromEntries(
    REJECTION_CATEGORIES.map((category) => [
      category,
      items.filter((i) => i.outcome === 'not_a_lead' && i.rejectionCategory === category).length,
    ]),
  ) as Record<YelpRejectionCategory, number>;

  const alreadyImported = tally('already_imported');
  const preview = tally('new_lead_preview');
  const created = tally('ticket_created');
  const createFailed = tally('create_failed');
  const newLeadsFound = preview + created + createFailed;

  return {
    messagesExamined: items.length,
    leadEmailsFound: alreadyImported + newLeadsFound,
    rejectedNotLeads: tally('not_a_lead'),
    rejectedByReason,
    alreadyImported,
    newLeadsFound,
    ticketsCreated: created,
    fetchFailed: tally('fetch_failed'),
    createFailed,
  };
}
