import { prisma } from '@/lib/db/prisma';
import {
  getReviewRequestSendAsEmail,
  type ReviewRequestSendAsEnv,
} from '@/lib/email/review-request-after-done';

/**
 * Single source of truth for which mailbox Dash scans for Yelp lead emails.
 *
 * `env-check`, the scan/preview routes and the Settings panel all resolve through here so a
 * diagnostic can never report a different mailbox than the one actually scanned. Reading
 * `process.env.REVIEW_REQUEST_SEND_AS_EMAIL` directly is wrong: that variable is usually
 * unset and the effective address comes from the review-request default.
 */

export type YelpMailboxSource =
  | 'YELP_LEAD_EMAIL_MAILBOX'
  | 'REVIEW_REQUEST_SEND_AS_EMAIL'
  | 'review-request built-in default'
  | 'explicit request';

export type YelpMailboxChoice = {
  /** Always non-empty: the review-request default applies when nothing is set. */
  mailbox: string;
  source: YelpMailboxSource;
  /** False when no env var chose this address, i.e. the built-in default was used. */
  fromEnv: boolean;
};

export type YelpMailboxState = YelpMailboxChoice & {
  connected: boolean;
  /** Every mailbox currently connected, so a mismatch is obvious in diagnostics. */
  connectedMailboxes: string[];
  /** True only when the resolved mailbox is connected and can actually be scanned. */
  ready: boolean;
  /** Populated when `ready` is false; names the address looked for and what is connected. */
  reason: string | null;
};

export type YelpMailboxEnv = ReviewRequestSendAsEnv & {
  YELP_LEAD_EMAIL_MAILBOX?: string | undefined;
};

export function chooseYelpLeadMailbox(
  env: YelpMailboxEnv = process.env,
  requested?: string | null,
): YelpMailboxChoice {
  const explicitRequest = requested?.trim();
  if (explicitRequest) {
    return { mailbox: explicitRequest.toLowerCase(), source: 'explicit request', fromEnv: false };
  }

  const dedicated = env.YELP_LEAD_EMAIL_MAILBOX?.trim();
  if (dedicated) {
    return { mailbox: dedicated.toLowerCase(), source: 'YELP_LEAD_EMAIL_MAILBOX', fromEnv: true };
  }

  const reviewSendAs = env.REVIEW_REQUEST_SEND_AS_EMAIL?.trim();
  return {
    mailbox: getReviewRequestSendAsEmail(env),
    source: reviewSendAs ? 'REVIEW_REQUEST_SEND_AS_EMAIL' : 'review-request built-in default',
    fromEnv: Boolean(reviewSendAs),
  };
}

function describeNotConnected(choice: YelpMailboxChoice, connectedMailboxes: string[]): string {
  const origin =
    choice.source === 'review-request built-in default'
      ? 'the review-request built-in default'
      : `${choice.source}`;
  if (connectedMailboxes.length === 0) {
    return (
      `No Gmail mailboxes are connected, so Dash cannot read ${choice.mailbox} (from ${origin}). ` +
      'Use Connect Gmail in Settings for the mailbox that receives Yelp lead emails.'
    );
  }
  return (
    `Dash looked for the Gmail connection ${choice.mailbox} (from ${origin}) but it is not connected. ` +
    `Connected mailboxes: ${connectedMailboxes.join(', ')}. ` +
    'Either connect that address in Settings, or set YELP_LEAD_EMAIL_MAILBOX to one of the connected ones.'
  );
}

/**
 * Resolves the mailbox and checks it against `GmailConnection`, matching addresses
 * case-insensitively exactly as `getGmailOAuth2ClientForSendMailbox` does.
 */
export async function resolveYelpLeadMailboxState(requested?: string | null): Promise<YelpMailboxState> {
  const choice = chooseYelpLeadMailbox(process.env, requested);

  const rows = await prisma.gmailConnection.findMany({ select: { googleEmail: true } });
  const connectedMailboxes = rows
    .map((r) => r.googleEmail?.trim().toLowerCase() ?? '')
    .filter(Boolean)
    .sort();
  const connected = connectedMailboxes.includes(choice.mailbox);

  return {
    ...choice,
    connected,
    connectedMailboxes,
    ready: connected,
    reason: connected ? null : describeNotConnected(choice, connectedMailboxes),
  };
}
