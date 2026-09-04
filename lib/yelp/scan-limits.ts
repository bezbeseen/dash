/**
 * Bounds for a Yelp lead-email scan. Pure and credential-free so the defaults and
 * clamping are covered by `npm run verify:yelp-email-parser`.
 */

export const YELP_SCAN_DEFAULT_LOOKBACK_DAYS = 14;

/** Enough to cover a routine two-week window without a slow round trip. */
export const YELP_SCAN_DEFAULT_MAX_MESSAGES = 50;

/** Hard caps: a run has to finish inside the serverless time budget. */
export const YELP_SCAN_MAX_LOOKBACK_DAYS = 180;
export const YELP_SCAN_MAX_MESSAGES = 100;

/**
 * Asking for a window longer than the default is a deliberate backfill, where stopping
 * early hides leads, so read as much as the cap allows.
 */
export function defaultMaxMessagesForLookback(lookbackDays: number): number {
  return lookbackDays > YELP_SCAN_DEFAULT_LOOKBACK_DAYS
    ? YELP_SCAN_MAX_MESSAGES
    : YELP_SCAN_DEFAULT_MAX_MESSAGES;
}

/** Echoed back so a capped scan is never mistaken for "that is all of them". */
export type YelpScanLimits = {
  /** What the caller asked for, after the adaptive default was applied. */
  lookbackDaysRequested: number;
  lookbackDays: number;
  lookbackDaysCap: number;
  maxMessagesRequested: number;
  maxMessages: number;
  maxMessagesCap: number;
  /** True when no explicit max was given, so the adaptive default chose one. */
  maxMessagesDefaulted: boolean;
};

export function resolveYelpScanLimits(opts: {
  lookbackDays?: number;
  maxMessages?: number;
}): YelpScanLimits {
  const lookbackDaysRequested = opts.lookbackDays ?? YELP_SCAN_DEFAULT_LOOKBACK_DAYS;
  const lookbackDays = Math.min(Math.max(lookbackDaysRequested, 1), YELP_SCAN_MAX_LOOKBACK_DAYS);

  const maxMessagesDefaulted = opts.maxMessages === undefined;
  const maxMessagesRequested = opts.maxMessages ?? defaultMaxMessagesForLookback(lookbackDays);
  const maxMessages = Math.min(Math.max(maxMessagesRequested, 1), YELP_SCAN_MAX_MESSAGES);

  return {
    lookbackDaysRequested,
    lookbackDays,
    lookbackDaysCap: YELP_SCAN_MAX_LOOKBACK_DAYS,
    maxMessagesRequested,
    maxMessages,
    maxMessagesCap: YELP_SCAN_MAX_MESSAGES,
    maxMessagesDefaulted,
  };
}
