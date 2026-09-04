/**
 * Decides whether a Yelp email is a genuine inbound customer lead.
 *
 * Yelp sends four kinds of mail through the same `reply+<hex>@messaging.yelp.com` proxy
 * that real leads use, so the sender cannot separate them: a customer's Request a Quote,
 * another shop replying to a quote *we* requested, our own shop's reply, and consumer
 * marketing aimed at the account holder. Subject-line exclusions would need updating for
 * every new campaign, so this classifies on the body instead: the positive signal is
 * Yelp's own "<Name> requested a quote from <shop> for a <job type>" sentence, and the
 * negatives are the phrases that only appear in the other three kinds.
 *
 * Pure and credential-free apart from `resolveYelpOwnIdentity`, which reads config.
 */
import { compactName, looksLikeOwnShopName, shopNamePatterns, type ShopNameEnv } from '@/lib/domain/shop-name';

export type YelpRejectionCategory =
  | 'not_yelp_sender'
  | 'consumer_marketing'
  | 'reply_to_our_own_request'
  | 'own_business_reply'
  | 'own_account_request'
  | 'not_lead_wording';

export type YelpEmailClassification =
  | { isLead: true }
  | { isLead: false; category: YelpRejectionCategory; reason: string };

/** Who "we" are, so mail involving our own shop or account is not booked as a lead. */
export type YelpOwnIdentity = {
  /** Compact forms of the shop's own business name. */
  shopNamePatterns: readonly string[];
  /** Compact forms of names the account holder submits quote requests under. */
  accountNames: readonly string[];
};

export const EMPTY_YELP_IDENTITY: YelpOwnIdentity = { shopNamePatterns: [], accountNames: [] };

export type YelpIdentityEnv = ShopNameEnv & { YELP_OWN_ACCOUNT_NAMES?: string | undefined };

/**
 * Derived, not hardcoded: the shop's name patterns come from the same
 * `INBOUND_SHOP_NAME_PATTERNS` config the pre-quote cards already use, and the scanned
 * mailbox supplies the domain root plus the account holder's local part.
 * `YELP_OWN_ACCOUNT_NAMES` is only needed when the owner's Yelp display name does not
 * resemble their email address.
 */
export function resolveYelpOwnIdentity(
  mailboxEmail: string | null | undefined,
  env: YelpIdentityEnv = process.env,
): YelpOwnIdentity {
  const [localPart = '', domain = ''] = (mailboxEmail ?? '').trim().toLowerCase().split('@');
  const domainRoot = domain.split('.')[0] ?? '';

  const configured = (env.YELP_OWN_ACCOUNT_NAMES ?? '')
    .split(',')
    .map(compactName)
    .filter(Boolean);

  return {
    shopNamePatterns: [...shopNamePatterns(env), compactName(domainRoot)].filter(Boolean),
    accountNames: [...configured, compactName(localPart)].filter(Boolean),
  };
}

/** Yelp's Request a Quote sentence, present in every genuine first-contact lead. */
const RAQ_SENTENCE = /([A-Z][^.\n]{0,60}?)\s+requested\s+a\s+quote\s+from\s+([^.\n]{2,80}?)\s+for\s+(?:an?\s+|some\s+)?([^.\n]{3,60})\s*\./;

/** Weaker wording that still marks customer contact, e.g. a follow-up on an open lead. */
const LEAD_SIGNALS = [
  /request(?:ed)?\s+a\s+quote/i,
  /quote\s+request/i,
  /new\s+lead/i,
  /sent\s+you\s+a\s+(?:new\s+)?message/i,
  /new\s+message/i,
  /responded\s+to\s+your\s+(?:message|quote)/i,
  /wants\s+a\s+quote/i,
  /is\s+interested\s+in/i,
  /replied\s+to\s+your/i,
  /you\s+have\s+a\s+new/i,
];

/** Mail from Yelp that is definitely not a customer lead. */
const NON_LEAD_SIGNALS = [
  /your\s+(?:ad|advertising|campaign)\s+(?:report|summary|performance|receipt|invoice)/i,
  /payment\s+(?:receipt|confirmation|failed)/i,
  /your\s+invoice/i,
  /new\s+review/i,
  /weekly\s+(?:summary|report|digest)/i,
  /monthly\s+(?:summary|report|digest)/i,
  /password/i,
  /verify\s+your\s+email/i,
  /billing/i,
];

/**
 * Yelp ships consumer campaigns through Braze and tags every link with the campaign
 * source. These are addressed to the account holder as a shopper, not to the business.
 */
const BRAZE_CAMPAIGN = /utm_(?:source|medium)=braze/i;

/** Yelp's own marketing senders, which never carry a lead. */
const MARKETING_SENDER = /@(?:mail|notify|email)\.yelp\.com>?\s*$/i;

/** Present when the other party replied to a quote *we* sent, i.e. we are the customer. */
const REPLY_TO_US = [
  /\breplied\s+to\s+you\b/i,
  /\bview\s+message\s+on\s+yelp\b/i,
  /\bmagic\s*link\b/i,
];

/** "Nel from Docs and Images replied to you" / "New message from Sam's Signs." */
const REPLYING_BUSINESS = [
  /\bfrom\s+([^\n]{2,80}?)\s+replied\s+to\s+you\b/i,
  /^\s*new\s+message\s+from\s+(.{2,80}?)\s*\.?\s*$/im,
];

function senderAddress(fromHeader: string): string {
  const m = /<([^>]+)>/.exec(fromHeader);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

function firstCapture(text: string, patterns: readonly RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function isOwnAccountName(name: string, identity: YelpOwnIdentity): boolean {
  const compact = compactName(name);
  if (compact.length < 3) return false;
  const firstToken = compactName(name.split(/\s+/)[0] ?? '');
  return identity.accountNames.some((own) => {
    if (own.length < 3) return false;
    if (own === compact || own === firstToken) return true;
    // Prefix matching only for names long enough to be distinctive: a short mailbox local
    // part like "bez" must not reject a customer called Bezalel.
    return own.length >= 5 && firstToken.startsWith(own);
  });
}

export function classifyYelpLeadEmail(input: {
  subject: string;
  body: string;
  from?: string;
  identity?: YelpOwnIdentity;
}): YelpEmailClassification {
  const { subject, body } = input;
  const from = input.from ?? '';
  const identity = input.identity ?? EMPTY_YELP_IDENTITY;
  const haystack = `${subject}\n${body.slice(0, 8000)}`;

  const raq = RAQ_SENTENCE.exec(body);

  if (NON_LEAD_SIGNALS.some((re) => re.test(subject))) {
    return {
      isLead: false,
      category: 'not_lead_wording',
      reason: 'yelp notice, not a customer lead (report, review, invoice or digest)',
    };
  }

  if (!raq && (BRAZE_CAMPAIGN.test(body) || (from && MARKETING_SENDER.test(from)))) {
    return {
      isLead: false,
      category: 'consumer_marketing',
      reason: `yelp consumer marketing to the account holder, not a lead (${
        BRAZE_CAMPAIGN.test(body) ? 'braze campaign links' : `marketing sender ${senderAddress(from)}`
      })`,
    };
  }

  if (!raq && REPLY_TO_US.some((re) => re.test(haystack))) {
    const business = firstCapture(haystack, REPLYING_BUSINESS);
    if (business && looksLikeOwnShopName(business, identity.shopNamePatterns)) {
      return {
        isLead: false,
        category: 'own_business_reply',
        reason: `our own shop replying on Yelp ("${business}"), not an inbound lead`,
      };
    }
    return {
      isLead: false,
      category: 'reply_to_our_own_request',
      reason: business
        ? `reply from ${business} to a quote we requested, so we are the customer`
        : 'reply to a quote we requested, so we are the customer',
    };
  }

  if (raq) {
    const requester = raq[1];
    if (isOwnAccountName(requester, identity)) {
      return {
        isLead: false,
        category: 'own_account_request',
        reason: `quote request submitted by our own Yelp account ("${requester.trim()}")`,
      };
    }
    // Deliberately not checked against our own shop name: if Yelp renames the business,
    // rejecting on a name mismatch would silently discard every real lead.
    return { isLead: true };
  }

  if (LEAD_SIGNALS.some((re) => re.test(haystack))) return { isLead: true };

  return {
    isLead: false,
    category: 'not_lead_wording',
    reason: 'no lead wording (looks like a report, review or receipt)',
  };
}

/** Kept for callers that only need the verdict, e.g. the parser's own guard. */
export function looksLikeYelpLeadEmail(subject: string, body: string): boolean {
  return classifyYelpLeadEmail({ subject, body }).isLead;
}
