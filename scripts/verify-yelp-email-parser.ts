/**
 * Checks the Yelp lead-email parser against representative notification emails.
 * Yelp reworks these templates periodically — run `npm run verify:yelp-email-parser`
 * after changing lib/yelp/lead-email.ts or the Gmail text extractor.
 */
import { htmlToPlainText } from '../lib/gmail/message-text';
import { looksLikeYelpLeadEmail, parseYelpLeadEmail, senderIsYelp } from '../lib/yelp/lead-email';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

// ---- sender detection
check('sender: no-reply@yelp.com', senderIsYelp('Yelp for Business <no-reply@yelp.com>'), true);
check('sender: bare messaging@yelp.com', senderIsYelp('messaging@yelp.com'), true);
check('sender: subdomain noreply@biz.yelp.com', senderIsYelp('Yelp <noreply@biz.yelp.com>'), true);
check('sender: lookalike notyelp.com rejected', senderIsYelp('spam <a@notyelp.com>'), false);
check('sender: yelp.com.evil.co rejected', senderIsYelp('spam <a@yelp.com.evil.co>'), false);

// ---- realistic RAQ notification
const raqBody = `You have a new lead on Yelp!

Jane D. requested a quote.

Job: Custom Storefront Signs
Location: Phoenix, AZ

"Hi, I need a new channel letter sign for my storefront, about 12 feet wide. Can you give me a quote?"

Phone: (602) 555-0143

Reply to Jane D.: https://biz.yelp.com/messaging/SoVHhx7Hel_XX0DKCLp72Q/thread/TbvEUYEi02cmSBmqCjQbkg

This email was sent to contact@beseensignshop.com
Unsubscribe | Manage notification preferences
© 2026 Yelp Inc. 350 Mission St, San Francisco`;

check('raq: detected as lead', looksLikeYelpLeadEmail('New quote request from Jane D.', raqBody), true);

const raq = parseYelpLeadEmail({
  subject: 'New quote request from Jane D.',
  body: raqBody,
  gmailThreadId: 'gmailthread123',
  receivedAt: new Date('2026-09-03T20:00:00Z'),
});
check('raq: dedupe key from yelp thread url', raq.dedupeKey, 'yelp:TbvEUYEi02cmSBmqCjQbkg');
check('raq: dedupeFromYelp', raq.dedupeFromYelp, true);
check('raq: customer name', raq.customerName, 'Jane D.');
check('raq: job type', raq.jobType, 'Custom Storefront Signs');
check('raq: project name', raq.projectName, 'Yelp · Custom Storefront Signs');
check('raq: phone', raq.phone, '(602) 555-0143');
check('raq: footer stripped', /Unsubscribe|Yelp Inc|sent to contact@/.test(raq.projectDescription ?? ''), false);
check('raq: message text kept', (raq.projectDescription ?? '').includes('channel letter sign'), true);
check('raq: shop address not used as lead email', raq.leadEmail, null);

// ---- follow-up message, HTML body
const htmlBody = `<html><body><p>Jane D. sent you a new message.</p>
<p>Name: Jane D.</p>
<p>Email: jane.doe.9f2c@messaging.yelp.com</p>
<div>Can you do it by Friday?&nbsp;Thanks!</div>
<a href="https://biz.yelp.com/messaging/SoVHhx7Hel_XX0DKCLp72Q/thread/TbvEUYEi02cmSBmqCjQbkg">Reply</a>
<p>Unsubscribe</p></body></html>`;
const htmlText = htmlToPlainText(htmlBody);
check('html: tags removed', /<[a-z]/i.test(htmlText), false);
check('html: nbsp decoded', htmlText.includes('Friday? Thanks!'), true);

const followUp = parseYelpLeadEmail({
  subject: 'Jane D. sent you a message',
  body: htmlText,
  gmailThreadId: 'gmailthread123',
  receivedAt: null,
});
check('follow-up: same dedupe key as original lead', followUp.dedupeKey, raq.dedupeKey);
check('follow-up: customer name from subject', followUp.customerName, 'Jane D.');
check('follow-up: yelp proxy reply address kept', followUp.leadEmail, 'jane.doe.9f2c@messaging.yelp.com');

// ---- no yelp url -> falls back to gmail thread
const noUrl = parseYelpLeadEmail({
  subject: 'You have a new lead from Marcus T.',
  body: 'Marcus T. requested a quote for vehicle wraps. Call 480-555-0199.',
  gmailThreadId: 'threadABC',
  receivedAt: null,
});
check('no-url: dedupe falls back to gmail thread', noUrl.dedupeKey, 'gmail-thread:threadABC');
check('no-url: dedupeFromYelp false', noUrl.dedupeFromYelp, false);
check('no-url: name parsed', noUrl.customerName, 'Marcus T.');
check('no-url: phone parsed', noUrl.phone, '480-555-0199');

// ---- non-lead yelp mail must be rejected
const nonLeads: [string, string][] = [
  ['Your ad report is ready', 'Your advertising report for August is ready. You have a new total of 40 views.'],
  ['You have a new review', 'Someone left you a new review on Yelp.'],
  ['Your invoice from Yelp', 'Your invoice for August advertising is attached. Billing details inside.'],
  ['Your weekly summary', 'Your weekly summary: you have a new page view count.'],
  ['Reset your password', 'Click to reset your password.'],
];
for (const [subject, body] of nonLeads) {
  check(`non-lead rejected: "${subject}"`, looksLikeYelpLeadEmail(subject, body), false);
}

// ---- phone sanity
const badPhone = parseYelpLeadEmail({
  subject: 'New quote request from Al',
  body: 'Al requested a quote. Order number 12345 and zip 85001.',
  gmailThreadId: 't1',
  receivedAt: null,
});
check('short digit runs are not treated as phone', badPhone.phone, null);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
