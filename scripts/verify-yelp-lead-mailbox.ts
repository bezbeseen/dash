/**
 * Checks how Dash picks the mailbox it scans for Yelp lead emails.
 *
 * Guards the defect this replaced: the feature read `process.env.REVIEW_REQUEST_SEND_AS_EMAIL`
 * directly and resolved to null, while env-check showed `contact@beseensignshop.com` because the
 * review-request helper applies a built-in default. Runs with no credentials and no database.
 */
import { chooseYelpLeadMailbox, type YelpMailboxEnv } from '../lib/yelp/lead-mailbox';
import { getReviewRequestSendAsEmail } from '../lib/email/review-request-after-done';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const REVIEW_DEFAULT = getReviewRequestSendAsEmail({});

// ---- dedicated var wins
const dedicated = chooseYelpLeadMailbox({
  YELP_LEAD_EMAIL_MAILBOX: 'leads@beseensignshop.com',
  REVIEW_REQUEST_SEND_AS_EMAIL: 'contact@beseensignshop.com',
});
check('YELP_LEAD_EMAIL_MAILBOX wins', dedicated.mailbox, 'leads@beseensignshop.com');
check('YELP_LEAD_EMAIL_MAILBOX source', dedicated.source, 'YELP_LEAD_EMAIL_MAILBOX');
check('YELP_LEAD_EMAIL_MAILBOX fromEnv', dedicated.fromEnv, true);

// ---- falls back to the review-request send-as var
const viaReview = chooseYelpLeadMailbox({ REVIEW_REQUEST_SEND_AS_EMAIL: 'contact@beseensignshop.com' });
check('falls back to REVIEW_REQUEST_SEND_AS_EMAIL', viaReview.mailbox, 'contact@beseensignshop.com');
check('fallback source', viaReview.source, 'REVIEW_REQUEST_SEND_AS_EMAIL');
check('fallback fromEnv', viaReview.fromEnv, true);

// ---- both unset: the review-request default applies, and it is reported as not from env.
// This is the exact production case; it must resolve rather than report "unset".
const neither = chooseYelpLeadMailbox({});
check('both unset resolves to review default', neither.mailbox, REVIEW_DEFAULT);
check('both unset is not from env', neither.fromEnv, false);
check('both unset source names the default', neither.source, 'review-request built-in default');
check('review default is a real address', /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(REVIEW_DEFAULT), true);

// ---- whitespace and casing are normalised so DB matching succeeds
check(
  'dedicated var: whitespace and case normalised',
  chooseYelpLeadMailbox({ YELP_LEAD_EMAIL_MAILBOX: '  Contact@BeSeenSignShop.com  ' }).mailbox,
  'contact@beseensignshop.com',
);
check(
  'review var: whitespace and case normalised',
  chooseYelpLeadMailbox({ REVIEW_REQUEST_SEND_AS_EMAIL: '\tCONTACT@beseensignshop.COM\n' }).mailbox,
  'contact@beseensignshop.com',
);
check(
  'whitespace-only dedicated var falls through',
  chooseYelpLeadMailbox({ YELP_LEAD_EMAIL_MAILBOX: '   ', REVIEW_REQUEST_SEND_AS_EMAIL: 'a@b.com' }).mailbox,
  'a@b.com',
);
check(
  'whitespace-only review var falls back to default',
  chooseYelpLeadMailbox({ REVIEW_REQUEST_SEND_AS_EMAIL: '   ' }).mailbox,
  REVIEW_DEFAULT,
);

// ---- explicit ?mailbox= request beats both env vars
const requested = chooseYelpLeadMailbox(
  { YELP_LEAD_EMAIL_MAILBOX: 'leads@beseensignshop.com' },
  ' BEZ@beseensignshop.com ',
);
check('explicit request wins', requested.mailbox, 'bez@beseensignshop.com');
check('explicit request source', requested.source, 'explicit request');
check(
  'blank request falls through to env',
  chooseYelpLeadMailbox({ YELP_LEAD_EMAIL_MAILBOX: 'leads@beseensignshop.com' }, '  ').mailbox,
  'leads@beseensignshop.com',
);

// ---- a configured mailbox with no connection is "not connected", never "not configured".
// resolveYelpLeadMailboxState needs the database, so assert the pure part it builds on:
// resolution always yields an address, leaving connectivity as the only failure mode.
const unconnected = chooseYelpLeadMailbox({ YELP_LEAD_EMAIL_MAILBOX: 'nobody@beseensignshop.com' });
check('unconnected mailbox still resolves an address', unconnected.mailbox, 'nobody@beseensignshop.com');
check('unconnected mailbox is still fromEnv', unconnected.fromEnv, true);

// ---- one resolver: env-check, the scan route and Settings all call chooseYelpLeadMailbox
// through resolveYelpLeadMailboxState, so identical inputs cannot diverge.
const envs: YelpMailboxEnv[] = [
  {},
  { REVIEW_REQUEST_SEND_AS_EMAIL: 'contact@beseensignshop.com' },
  { YELP_LEAD_EMAIL_MAILBOX: 'leads@beseensignshop.com' },
  { YELP_LEAD_EMAIL_MAILBOX: ' Mixed@Case.com ', REVIEW_REQUEST_SEND_AS_EMAIL: 'other@x.com' },
];
for (const [i, env] of envs.entries()) {
  check(
    `deterministic for identical input #${i + 1}`,
    chooseYelpLeadMailbox(env),
    chooseYelpLeadMailbox({ ...env }),
  );
}

// ---- the fallback must track the review-request helper, not a copied literal
check(
  'fallback matches getReviewRequestSendAsEmail for the same env',
  chooseYelpLeadMailbox({ REVIEW_REQUEST_SEND_AS_EMAIL: 'Someone@Example.com' }).mailbox,
  getReviewRequestSendAsEmail({ REVIEW_REQUEST_SEND_AS_EMAIL: 'Someone@Example.com' }),
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
