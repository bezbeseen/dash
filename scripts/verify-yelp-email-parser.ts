/**
 * Checks the Yelp lead-email parser against representative notification emails.
 * Yelp reworks these templates periodically — run `npm run verify:yelp-email-parser`
 * after changing lib/yelp/lead-email.ts or the Gmail text extractor.
 */
import { htmlToPlainText } from '../lib/gmail/message-text';
import {
  cleanYelpEmailBody,
  extractYelpConversationId,
  looksLikeYelpLeadEmail,
  parseYelpLeadEmail,
  senderIsYelp,
  trimUrlPunctuation,
} from '../lib/yelp/lead-email';

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

// ---------------------------------------------------------------------------
// Production fixtures: first-contact "Request a Quote" notifications, which
// arrive as From: Yelp Inbox <reply+<32-hex>@messaging.yelp.com> and
// Subject: "Be Seen Print Sign and Design's response to <Customer>".
// ---------------------------------------------------------------------------

/** Yelp pads the preheader with soft hyphens + ZWNJ to control the inbox preview line. */
const PREHEADER = '\u034f\u200c '.repeat(80);

function yelpFrom(hex: string): string {
  return `Yelp Inbox <reply+${hex}@messaging.yelp.com>`;
}

function yelpSubject(customer: string): string {
  return `Be Seen Print Sign and Design's response to ${customer}`;
}

function yelpLeadBody(o: {
  headingJob: string;
  sentenceJob: string;
  firstName: string;
  displayName: string;
  hex: string;
  survey: string;
}): string {
  const inbox = `https://biz.yelp.com/messaging/mark_as_replied_autosubmit/${o.hex}?utm_source=request_a_quote_first_message_v4&utm_medium=email&utm_campaign=Aug-30-2026`;
  return `${PREHEADER}
## You have a new ${o.headingJob} request.

${o.displayName}
0
3
0

{num_attachments, plural, one {# photo attachment} other {# photo attachments}}

${o.firstName} requested a quote from Be Seen Print Sign and Design for a ${o.sentenceJob}.

${o.survey}

[Reply to ${o.firstName} on Yelp Biz](${inbox})

Reply to stay eligible for leads and keep your response rate up!

Your response time
3 hours
Your response rate
90%

Having a low response rate affects your ranking in search results. Your messaging may also be turned off.

Keep track of incoming leads with text notifications.
[Get text notifications](${inbox})
[](${inbox})
[I'm not interested](${inbox})
[](${inbox})
[I already replied](${inbox})
[](${inbox})
[Report this conversation](${inbox})
[](${inbox})

Or reply directly to this email

Sent to Be Seen Print Sign and Design
377 Laurelwood Rd Santa Clara, CA 95054

Don't miss out on future leads — stay responsive!
`;
}

const ROSE_HEX = '4448b0c77b28433099878fee0b503db2';
const roseSurvey = `How many pages do you need to print?
100+
What size banner do you need?
24" x 36"
Do you need to submit your photos online?
Yes
When do you require this service?
As soon as possible
Are there any other details you'd like to share?
it's for a stock/crypto seminar/boot camp
In what location do you need the service?
95112`;

const roseFrom = yelpFrom(ROSE_HEX);
const roseSubjectLine = yelpSubject('Rose L.');
const roseBody = yelpLeadBody({
  headingJob: 'sign printing',
  sentenceJob: 'sign printing',
  firstName: 'Rose',
  displayName: 'Rose L.',
  hex: ROSE_HEX,
  survey: roseSurvey,
});

check('prod: still classified as a lead', looksLikeYelpLeadEmail(roseSubjectLine, roseBody), true);

// BUG 1 — the conversation id is in the sender and in the URL, and they agree.
check('prod: hex from reply+ sender', extractYelpConversationId(roseFrom, ''), ROSE_HEX);
check('prod: hex from inbox url path', extractYelpConversationId('', roseBody), ROSE_HEX);
check(
  'prod: sender hex and url hex agree',
  extractYelpConversationId(roseFrom, ''),
  extractYelpConversationId('', roseBody),
);

const rose = parseYelpLeadEmail({
  subject: roseSubjectLine,
  body: roseBody,
  from: roseFrom,
  gmailThreadId: '19f7255d19aefc74',
  receivedAt: new Date('2026-08-30T17:04:00Z'),
});
const roseDesc = rose.projectDescription ?? '';

check('prod: dedupe key is the yelp conversation id', rose.dedupeKey, `yelp:${ROSE_HEX}`);
check('prod: dedupeFromYelp', rose.dedupeFromYelp, true);
check('prod: gmail thread id is not the dedupe key', roseDesc.includes('gmail-thread:'), false);

// MINOR — the last initial survives.
check('prod: customer name keeps last initial', rose.customerName, 'Rose L.');

// BUG 2 — job type comes from the anchored heading, never from survey wording.
check('prod: job type from heading', rose.jobType, 'sign printing');
check('prod: project name', rose.projectName, 'Yelp · sign printing');

// BUG 3 — no trailing paren on the extracted URL.
check('prod: thread url has no trailing paren', /[).,;]$/.test(rose.threadUrl ?? ''), false);
check('prod: thread url keeps its query', (rose.threadUrl ?? '').endsWith('utm_campaign=Aug-30-2026'), true);
check('prod: broken url not left in description', roseDesc.includes('Aug-30-2026)'), false);
check('trimUrlPunctuation: strips stacked punctuation', trimUrlPunctuation('https://x.test/a?b=1).'), 'https://x.test/a?b=1');

// BUG 4 — template garbage is gone.
check('prod: invisible padding stripped', /[\u00ad\u034f\u200b-\u200f\ufeff]/.test(roseDesc), false);
check('prod: ICU placeholder stripped', roseDesc.includes('num_attachments'), false);
check('prod: no plural placeholder remnants', /\{.*plural.*\}/.test(roseDesc), false);
check('prod: broken link artifacts stripped', /\]\(\[link\]|\[link\]|\[\]\(/.test(roseDesc), false);
check('prod: stray attachment counters stripped', /^\s*\d{1,3}\s*$/m.test(roseDesc), false);
for (const nag of [
  'Reply to stay eligible',
  "Don't miss out on future leads",
  'Having a low response rate',
  'Your response time',
  'Your response rate',
  'Keep track of incoming leads',
  'Get text notifications',
  "I'm not interested",
  'I already replied',
  'Report this conversation',
  'Or reply directly to this email',
  'Sent to Be Seen Print Sign and Design',
  '377 Laurelwood Rd',
]) {
  check(`prod: boilerplate removed — "${nag}"`, roseDesc.includes(nag), false);
}

// BUG 5 — the questionnaire is structured, in order, with the free text kept.
check(
  'prod: survey questions parsed in order',
  rose.survey.map((p) => p.question),
  [
    'How many pages do you need to print?',
    'What size banner do you need?',
    'Do you need to submit your photos online?',
    'When do you require this service?',
    "Are there any other details you'd like to share?",
    'In what location do you need the service?',
  ],
);
check('prod: survey answers parsed', rose.survey.map((p) => p.answers.join('|')), [
  '100+',
  '24" x 36"',
  'Yes',
  'As soon as possible',
  "it's for a stock/crypto seminar/boot camp",
  '95112',
]);
check(
  'prod: questionnaire formatted like the Leads API path',
  roseDesc.includes('Project questionnaire:') &&
    roseDesc.includes('How many pages do you need to print?\n  • 100+'),
  true,
);
check('prod: free-text answer surfaced', rose.customerNotes, "it's for a stock/crypto seminar/boot camp");
check('prod: free-text answer prominent in description', roseDesc.includes('Customer notes:'), true);
check('prod: service zip kept', rose.serviceZip, '95112');
check('prod: yelp does not expose consumer email', rose.leadEmail, null);

// ---- the other observed job types, plus one Yelp has not sent yet
const jobTypeCases: [string, string, string][] = [
  ['signmaking', 'signmaking', 'Bob F.'],
  ['photo printing', 'photo printing', 'Adeel S.'],
  ['banner installation', 'banner installation', 'Peggy'],
];
for (const [headingJob, sentenceJob, customer] of jobTypeCases) {
  const hex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const parsed = parseYelpLeadEmail({
    subject: yelpSubject(customer),
    from: yelpFrom(hex),
    body: yelpLeadBody({
      headingJob,
      sentenceJob,
      firstName: customer.split(' ')[0],
      displayName: customer,
      hex,
      survey: roseSurvey,
    }),
    gmailThreadId: 'gt1',
    receivedAt: null,
  });
  check(`prod: job type "${headingJob}"`, parsed.jobType, headingJob);
  check(`prod: name "${customer}" preserved`, parsed.customerName, customer);
  check(`prod: "${headingJob}" survey text never becomes job type`, ['the service', 'to print'].includes(parsed.jobType ?? ''), false);
}

// Heading missing: the "requested a quote ... for a X." sentence is the only anchor left.
const headingless = parseYelpLeadEmail({
  subject: yelpSubject('Chris'),
  from: yelpFrom('bb11cc22dd33ee44ff5566778899aabb'),
  body: `Chris requested a quote from Be Seen Print Sign and Design for a vehicle wrap.

How many pages do you need to print?
2
In what location do you need the service?
94087`,
  gmailThreadId: 'gt2',
  receivedAt: null,
});
check('prod: job type from the quote sentence', headingless.jobType, 'vehicle wrap');
check('prod: bare name without trailing punctuation', headingless.customerName, 'Chris');
check('prod: numeric survey answer kept', headingless.survey[0]?.answers, ['2']);

// The survey wording must never win, even with no other anchor available.
const surveyOnly = parseYelpLeadEmail({
  subject: yelpSubject('Parastou'),
  from: yelpFrom('cc11dd22ee33ff445566778899aabbcc'),
  body: `Parastou sent you a new message.

How many pages do you need to print?
5
In what location do you need the service?
95014`,
  gmailThreadId: 'gt3',
  receivedAt: null,
});
check('prod: no anchor means no job type', surveyOnly.jobType, null);
check('prod: falls back to generic project name', surveyOnly.projectName, 'Yelp · Request a Quote');

// ---- customer typed their own contact details into the free-text answer
const silvanaHex = 'dd11ee22ff334455667788990011aabb';
const silvana = parseYelpLeadEmail({
  subject: yelpSubject('Silvana W.'),
  from: yelpFrom(silvanaHex),
  body: yelpLeadBody({
    headingJob: 'signmaking',
    sentenceJob: 'signmaking',
    firstName: 'Silvana',
    displayName: 'Silvana W.',
    hex: silvanaHex,
    survey: `When do you require this service?
As soon as possible
Are there any other details you'd like to share?
Please coordinate with my husband Sam 650 366-4020 swenkenb@yahoo.com
In what location do you need the service?
94541`,
  }),
  gmailThreadId: 'gt4',
  receivedAt: null,
});
check('prod: free-text email still extracted', silvana.leadEmail, 'swenkenb@yahoo.com');
check('prod: free-text phone still extracted', silvana.phone, '650 366-4020');
check('prod: free-text zip still extracted', silvana.serviceZip, '94541');

// ---- the odd "Robert .." subject
const robert = parseYelpLeadEmail({
  subject: yelpSubject('Robert ..'),
  from: yelpFrom('ee11ff2233445566778899aabbccddee'),
  body: yelpLeadBody({
    headingJob: 'sign printing',
    sentenceJob: 'sign printing',
    firstName: 'Robert',
    displayName: 'Robert ..',
    hex: 'ee11ff2233445566778899aabbccddee',
    survey: roseSurvey,
  }),
  gmailThreadId: 'gt5',
  receivedAt: null,
});
check('prod: double-period name emits no trailing punctuation', robert.customerName, 'Robert');

// ---- cleaner unit checks
check(
  'clean: zero-width run collapses to nothing',
  cleanYelpEmailBody(`${PREHEADER}\nHello`),
  'Hello',
);
check(
  'clean: ICU placeholder removed on its own line',
  cleanYelpEmailBody('{num_attachments, plural, one {# photo attachment} other {# photo attachments}}\nHello'),
  'Hello',
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
