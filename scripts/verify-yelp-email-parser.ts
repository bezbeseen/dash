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
} from '../lib/yelp/lead-email';
import { buildYelpLeadProjectDescription } from '../lib/yelp/leads-webhook';
import { defaultMaxMessagesForLookback, resolveYelpScanLimits } from '../lib/yelp/scan-limits';
import { summarizeYelpScan, type YelpEmailOutcome } from '../lib/yelp/scan-summary';
import { safeYelpUrl, YELP_BIZ_INBOX_URL } from '../lib/yelp/url';

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
${o.displayName}
0
0
0
3 hours
100%
© 2026 | Yelp Inc, 350 Mission Street, San Francisco, CA 94105, USA | business.yelp.com
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

// BUG 3 / URL safety — nothing destructive, no trailing paren, no tracking params.
check('prod: inbox url is the plain biz inbox', rose.threadUrl, YELP_BIZ_INBOX_URL);
check('prod: conversation id surfaced for finding the thread', rose.conversationId, ROSE_HEX);
check('prod: conversation id in description', roseDesc.includes(`Yelp conversation id: ${ROSE_HEX}`), true);
check('prod: broken url not left in description', roseDesc.includes('Aug-30-2026)'), false);
check('safeYelpUrl: strips trailing punctuation', safeYelpUrl('https://biz.yelp.com/messaging).'), 'https://biz.yelp.com/messaging');
check(
  'safeYelpUrl: strips utm_ and ytl_ params',
  safeYelpUrl('https://biz.yelp.com/messaging/BIZ/thread/ABC?utm_source=x&ytl_token=abc123&keep=1'),
  'https://biz.yelp.com/messaging/BIZ/thread/ABC?keep=1',
);
check(
  'safeYelpUrl: drops the only-param case cleanly',
  safeYelpUrl('https://biz.yelp.com/messaging/BIZ/thread/ABC?utm_campaign=Aug-30-2026'),
  'https://biz.yelp.com/messaging/BIZ/thread/ABC',
);
check(
  'safeYelpUrl: refuses the autosubmit action endpoint',
  safeYelpUrl(`https://biz.yelp.com/messaging/mark_as_replied_autosubmit/${ROSE_HEX}?utm_source=x`),
  null,
);
for (const destructive of [
  'https://biz.yelp.com/messaging/already_replied/abc',
  'https://biz.yelp.com/messaging/not_interested/abc',
  'https://biz.yelp.com/messaging/report_conversation/abc',
  'https://www.yelp.com/one_click/abc',
  'https://biz.yelp.com/thread/abc?reply_type=auto',
]) {
  check(`safeYelpUrl: refuses ${destructive.slice(0, 48)}`, safeYelpUrl(destructive), null);
}

/**
 * Safety property: opening a Yelp action URL from a ticket marks the lead replied without
 * a reply being sent. No stored string may contain one, in either ingest path.
 */
const FORBIDDEN_URL_MARKERS = ['mark_as_replied', 'autosubmit', 'reply_type=', 'ytl_', 'utm_'];
function assertNoUnsafeUrls(label: string, stored: (string | null)[]) {
  for (const marker of FORBIDDEN_URL_MARKERS) {
    const offender = stored.find((s) => (s ?? '').toLowerCase().includes(marker));
    check(`${label}: no "${marker}" in stored output`, offender ?? null, null);
  }
}
assertNoUnsafeUrls('prod fixture', [
  rose.projectDescription,
  rose.threadUrl,
  rose.projectName,
  rose.customerName,
  rose.dedupeKey,
  rose.customerNotes,
  ...rose.survey.flatMap((p) => [p.question, ...p.answers]),
]);

// An older template that did carry a real deep link keeps it, minus the tracking noise.
const deepLinked = parseYelpLeadEmail({
  subject: yelpSubject('Dana K.'),
  from: yelpFrom('ab11cd22ef33ab44cd55ef66ab77cd88'),
  body: `Dana requested a quote from Be Seen Print Sign and Design for a signmaking.

[Reply to Dana on Yelp Biz](https://biz.yelp.com/messaging/oj517fznD2Gw2v5CUUIw_Q/thread/ab11cd22ef33ab44cd55ef66ab77cd88?utm_source=request_a_quote_first_message_v4)`,
  gmailThreadId: 'gt6',
  receivedAt: null,
});
check(
  'prod: real deep link kept and de-tracked',
  deepLinked.threadUrl,
  'https://biz.yelp.com/messaging/oj517fznD2Gw2v5CUUIw_Q/thread/ab11cd22ef33ab44cd55ef66ab77cd88',
);
assertNoUnsafeUrls('deep-linked fixture', [deepLinked.projectDescription, deepLinked.threadUrl]);

// No Yelp messaging link at all: no inbox line invented.
const noInbox = parseYelpLeadEmail({
  subject: 'You have a new lead from Marcus T.',
  body: 'Marcus T. requested a quote for vehicle wraps. Call 480-555-0199.',
  gmailThreadId: 'threadABC',
  receivedAt: null,
});
check('prod: no inbox url when the email has none', noInbox.threadUrl, null);

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
// The last question used to run to end-of-body and vacuum up Yelp's stats card footer.
check('prod: zip question has exactly one answer', rose.survey.at(-1)?.answers, ['95112']);
check('prod: service location line is only the zip', roseDesc.includes('Service location: 95112\n'), true);
const allAnswers = rose.survey.flatMap((p) => p.answers);
check('prod: no copyright footer in any answer', allAnswers.filter((a) => /yelp inc/i.test(a)), []);
check('prod: no response-rate value in any answer', allAnswers.filter((a) => /^\d+\s*%$/.test(a)), []);
check(
  'prod: no response-time value in any answer',
  allAnswers.filter((a) => /^\d+\s*(?:minutes?|hours?|days?)$/i.test(a)),
  [],
);
check('prod: no name echo in any answer', allAnswers.filter((a) => /^Rose L\.?$/.test(a)), []);
check('prod: no bare counters in any answer', allAnswers.filter((a) => /^\d{1,4}$/.test(a) && a !== '95112'), []);

check('prod: free-text answer surfaced', rose.customerNotes, "it's for a stock/crypto seminar/boot camp");
check('prod: free-text answer prominent in description', roseDesc.includes('Customer notes:'), true);
check('prod: service zip kept', rose.serviceZip, '95112');
check('prod: yelp does not expose consumer email', rose.leadEmail, null);

/**
 * The strip list can only remove footer text we have already seen, so the terminator has
 * to hold on its own: novel trailing content must not become an answer either.
 */
const novelFooter = parseYelpLeadEmail({
  subject: yelpSubject('Alejandra M.'),
  from: yelpFrom('ff11aa22bb33cc44dd55ee66ff778899'),
  body: `You have a new sign printing request.

Alejandra requested a quote from Be Seen Print Sign and Design for a sign printing.

Are there any other details you'd like to share?
storefront window lettering
In what location do you need the service?
95062
Alejandra M
Nueva seccion de Yelp que no hemos visto todavia
Refer a friend and earn 25 dollars of ad credit
Loyalty tier: Gold
`,
  gmailThreadId: 'gt7',
  receivedAt: null,
});
check('terminator: zip answer is not polluted by unknown footer text', novelFooter.survey.at(-1)?.answers, ['95062']);
check('terminator: service zip still parsed', novelFooter.serviceZip, '95062');
check(
  'terminator: unknown footer text never becomes an answer',
  novelFooter.survey.flatMap((p) => p.answers),
  ['storefront window lettering', '95062'],
);
check(
  'terminator: service location line is only the zip',
  (novelFooter.projectDescription ?? '').includes('Service location: 95062\n'),
  true,
);

// A blank line ends an answer run too, so a footer with no name echo cannot leak in.
const blankLineTerminated = parseYelpLeadEmail({
  subject: yelpSubject('Nadia B.'),
  from: yelpFrom('aa22bb33cc44dd55ee66ff7788990011'),
  body: `Nadia requested a quote from Be Seen Print Sign and Design for a signmaking.

In what location do you need the service?
94089

Totally new trailing block Yelp added this morning
`,
  gmailThreadId: 'gt8',
  receivedAt: null,
});
check('terminator: blank line ends the answer run', blankLineTerminated.survey.at(-1)?.answers, ['94089']);

// A question whose answer legitimately wraps onto a second contiguous line keeps both.
const wrapped = parseYelpLeadEmail({
  subject: yelpSubject('Owen P.'),
  from: yelpFrom('bb33cc44dd55ee66ff778899001122aa'),
  body: `Owen requested a quote from Be Seen Print Sign and Design for a signmaking.

Are there any other details you'd like to share?
two 4x8 panels for the front
and one small window decal
`,
  gmailThreadId: 'gt9',
  receivedAt: null,
});
check('terminator: contiguous multi-line answer kept', wrapped.survey[0]?.answers, [
  'two 4x8 panels for the front',
  'and one small window decal',
]);

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

// ---- Leads API path: same safety property, same questionnaire formatting
const apiLead = buildYelpLeadProjectDescription(
  {
    business_id: 'oj517fznD2Gw2v5CUUIw_Q',
    conversation_id: ROSE_HEX,
    link_to_reply_in_yelp:
      'https://biz.yelp.com/leads_center/VXi7gzRqPKp63X0u6fUtbg/leads/18kPq7GPye-YQ3LyKyAZPw?utm_source=api',
    user: { display_name: 'Rose L.' },
    project: {
      job_names: ['sign printing'],
      survey_answers: [
        { question_text: 'How many pages do you need to print?', answer_text: ['100+'] },
        {
          question_text: "Are there any other details you'd like to share?",
          answer_text: ["it's for a stock/crypto seminar/boot camp"],
        },
      ],
    },
  },
  [
    {
      event_type: 'TEXT',
      user_type: 'CONSUMER',
      event_content: {
        text: `Please confirm here: https://biz.yelp.com/messaging/mark_as_replied_autosubmit/${ROSE_HEX}`,
      },
    },
  ],
);
const apiDesc = apiLead.projectDescription ?? '';
check(
  'api: prefers link_to_reply_in_yelp, de-tracked',
  apiDesc.includes('Inbox: https://biz.yelp.com/leads_center/VXi7gzRqPKp63X0u6fUtbg/leads/18kPq7GPye-YQ3LyKyAZPw'),
  true,
);
check('api: action link inside conversation text is redacted', apiDesc.includes('[yelp action link removed]'), true);
check(
  'api: questionnaire formatting matches the email path',
  apiDesc.includes('How many pages do you need to print?\n  • 100+'),
  true,
);
assertNoUnsafeUrls('leads api path', [apiDesc, apiLead.projectName, apiLead.customerName]);

const apiThreadFallback = buildYelpLeadProjectDescription(
  { business_id: 'BIZ123', conversation_id: 'CONV456', user: { display_name: 'Dana K.' }, project: {} },
  [],
);
check(
  'api: falls back to the thread deep link',
  (apiThreadFallback.projectDescription ?? '').includes('Inbox: https://biz.yelp.com/messaging/BIZ123/thread/CONV456'),
  true,
);

// ---- honest scan counts
const outcomes: YelpEmailOutcome[] = [
  'not_a_lead',
  'not_a_lead',
  'not_a_lead',
  'fetch_failed',
  'already_imported',
  'already_imported',
  'ticket_created',
  'ticket_created',
  'create_failed',
];
const counts = summarizeYelpScan(outcomes.map((outcome) => ({ outcome })));
check('counts: messages examined', counts.messagesExamined, 9);
check('counts: lead emails found', counts.leadEmailsFound, 5);
check('counts: rejected not leads', counts.rejectedNotLeads, 3);
check('counts: already imported', counts.alreadyImported, 2);
check('counts: new leads found', counts.newLeadsFound, 3);
check('counts: tickets created', counts.ticketsCreated, 2);
check('counts: fetch failed', counts.fetchFailed, 1);
check('counts: create failed', counts.createFailed, 1);
check(
  'counts: buckets sum to messages examined',
  counts.leadEmailsFound + counts.rejectedNotLeads + counts.fetchFailed,
  counts.messagesExamined,
);

// The dry run the user saw: 20 examined, 11 leads, 9 not leads, 0 tickets written.
const dryRun = summarizeYelpScan([
  ...Array.from({ length: 11 }, () => ({ outcome: 'new_lead_preview' as YelpEmailOutcome })),
  ...Array.from({ length: 9 }, () => ({ outcome: 'not_a_lead' as YelpEmailOutcome })),
]);
check('counts: dry run reports 9 rejected, not 11 "skipped"', dryRun.rejectedNotLeads, 9);
check('counts: dry run creates nothing', dryRun.ticketsCreated, 0);
check('counts: dry run new leads are the importable ones', dryRun.newLeadsFound, 11);

// ---- scan limits: a backfill must not stop at the routine default
const routine = resolveYelpScanLimits({});
check('limits: routine scan window', routine.lookbackDays, 14);
check('limits: routine scan max', routine.maxMessages, 50);
check('limits: routine scan used a default max', routine.maxMessagesDefaulted, true);

const backfill = resolveYelpScanLimits({ lookbackDays: 365 });
check('limits: long window clamps to the day cap', backfill.lookbackDays, 180);
check('limits: long window reads up to the message cap', backfill.maxMessages, 100);
check('limits: requested days echoed unclamped', backfill.lookbackDaysRequested, 365);

const explicit = resolveYelpScanLimits({ lookbackDays: 365, maxMessages: 500 });
check('limits: explicit max still clamps to the cap', explicit.maxMessages, 100);
check('limits: explicit max is not treated as a default', explicit.maxMessagesDefaulted, false);
check('limits: floor of one message', resolveYelpScanLimits({ maxMessages: 0 }).maxMessages, 1);
check('limits: floor of one day', resolveYelpScanLimits({ lookbackDays: 0 }).lookbackDays, 1);
check('limits: 14 days stays on the routine default', defaultMaxMessagesForLookback(14), 50);
check('limits: 15 days switches to the cap', defaultMaxMessagesForLookback(15), 100);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
