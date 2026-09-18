/**
 * Ticket-from-Gmail helpers (customer pick + QBO payload). No live Gmail/QBO.
 * Run `npm run verify:gmail-from-thread` after changing those modules.
 */
import { fromGmailBoardToast, fromGmailJobToast } from '../lib/domain/integration-query-toasts';
import { gmailAddonAuthorized } from '../lib/gmail/addon-auth';
import {
  collectGmailApiIdCandidates,
  couldNotOpenGmailThreadMessage,
  extractGmailAuthuserEmail,
  extractGmailUrlUserIndex,
  extractRfc822MsgIdForSearch,
  gmailBookmarkTicketExplanation,
  gmailWebFIdToHex,
  looksLikeGmailPaste,
  orderMailboxesForGmailPaste,
  parseGmailThreadId,
  resolveGmailThreadInputForApi,
} from '../lib/gmail/parse-thread-id';
import {
  pickCustomerFromThreadMessages,
  gmailLeadProjectDescription,
} from '../lib/gmail/thread-customer';
import {
  buildUnsentEstimatePayload,
  clipQboMemo,
  qboFaultLooksLikeDuplicateName,
  sanitizeQboDisplayName,
  splitPersonName,
} from '../lib/quickbooks/write-from-email';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const MAILBOXES = ['contact@beseensignshop.com', 'bez@beseensignshop.com'];

const customer = pickCustomerFromThreadMessages(
  [
    {
      from: 'Jane Doe <jane@acmesigns.com>',
      to: 'contact@beseensignshop.com',
      subject: 'Re: Channel letters for the storefront',
      snippet: 'Can you quote 24" letters?',
    },
  ],
  MAILBOXES,
);
check('customer: email', customer?.email, 'jane@acmesigns.com');
check('customer: display name', customer?.name, 'Jane Doe');
check('customer: subject strips Re', customer?.subject, 'Channel letters for the storefront');

const shopFirst = pickCustomerFromThreadMessages(
  [
    {
      from: 'Be Seen <contact@beseensignshop.com>',
      to: 'mickey.colombo@thebackninegolf.com',
      subject: 'Invoice 1580',
      snippet: 'Thanks',
    },
  ],
  MAILBOXES,
);
check('customer: To used when From is the shop', shopFirst?.email, 'mickey.colombo@thebackninegolf.com');

const none = pickCustomerFromThreadMessages(
  [
    {
      from: 'no-reply@yelp.com',
      to: 'contact@beseensignshop.com',
      subject: 'New lead',
    },
  ],
  MAILBOXES,
);
check('customer: vendor-only thread is rejected', none, null);

const desc = gmailLeadProjectDescription({
  email: 'jane@acmesigns.com',
  name: 'Jane Doe',
  subject: 'Channel letters',
  snippet: 'Need a quote',
  participants: [],
});
check('description starts with Email', desc.startsWith('Email: jane@acmesigns.com'), true);

check('sanitize: colon stripped', sanitizeQboDisplayName('Acme: Jane'), 'Acme Jane');
check('split name', splitPersonName('Jane Doe'), { given: 'Jane', family: 'Doe' });
check('fault 6240', qboFaultLooksLikeDuplicateName('QuickBooks Fault: {"Error":[{"code":"6240"}]}'), true);
check('clip memo', clipQboMemo('  hello   world  ', 20), 'hello world');

const withItem = buildUnsentEstimatePayload({
  customerId: '99',
  email: 'jane@acmesigns.com',
  subject: 'Channel letters',
  snippet: 'Need a quote',
  item: { id: '3', name: 'Services', type: 'Service' },
  amount: 0,
});
const lines = withItem.Line as { DetailType: string; Amount: number; SalesItemLineDetail?: { UnitPrice: number } }[];
check('estimate: sales line at $0', lines[0]?.DetailType, 'SalesItemLineDetail');
check('estimate: amount 0', lines[0]?.Amount, 0);
check('estimate: not emailed', withItem.EmailStatus, 'NotSet');
check('estimate: bill email', (withItem.BillEmail as { Address: string }).Address, 'jane@acmesigns.com');
check('estimate: memo is subject', (withItem.CustomerMemo as { value: string }).value, 'Channel letters');

const noItem = buildUnsentEstimatePayload({
  customerId: '99',
  email: 'jane@acmesigns.com',
  subject: 'Hi',
  snippet: '',
  item: null,
});
check(
  'estimate: description-only fallback when no item',
  (noItem.Line as { DetailType: string }[])[0]?.DetailType,
  'DescriptionOnly',
);

const hex = '18c4e2a1b2c3d4e5';
const threadFDec = BigInt(`0x${hex}`).toString();

check('parse: th= query', parseGmailThreadId(`https://mail.google.com/mail/u/0/?th=${hex}`), hex);
check(
  'parse: hash inbox hex',
  parseGmailThreadId(`https://mail.google.com/mail/u/0/#inbox/${hex}`),
  hex,
);
check(
  'parse: thread-f decimal to hex',
  parseGmailThreadId(`https://mail.google.com/mail/u/1/#all/thread-f:${threadFDec}`),
  hex,
);
check('convert: thread-f', gmailWebFIdToHex(`thread-f:${threadFDec}`), hex);
check(
  'parse: permmsgid msg-f',
  parseGmailThreadId(
    `https://mail.google.com/mail/u/0?view=om&permmsgid=msg-f%3A${threadFDec}`,
  ),
  hex,
);
check('parse: bare API hex (add-on thread id)', parseGmailThreadId(hex), hex);
check('paste: bare API hex is a Gmail id', looksLikeGmailPaste(hex), true);
check(
  'parse: FMfcgz Copy link is not an API id',
  parseGmailThreadId('https://mail.google.com/mail/u/0/#inbox/FMfcgzQgLjNPlfJCVRfnNkPGkLhWClCW'),
  null,
);
check(
  'resolve: FMfcgz does not send the URL to the API',
  resolveGmailThreadInputForApi('https://mail.google.com/mail/u/0/#inbox/FMfcgzQgLjNPlfJCVRfnNkPGkLhWClCW'),
  '',
);
check(
  'paste: FMfcgz URL still counts as a Gmail paste',
  looksLikeGmailPaste('https://mail.google.com/mail/u/0/#inbox/FMfcgzQgLjNPlfJCVRfnNkPGkLhWClCW'),
  true,
);
check(
  'parse: th= wins over FMfcgz hash',
  parseGmailThreadId(`https://mail.google.com/mail/u/0/#inbox/FMfcgzQgLjNPlfJCVRfnNkPGkLhWClCW?th=${hex}`),
  hex,
);
check(
  'rfc822: Message-ID line',
  extractRfc822MsgIdForSearch('Message-ID: <CAEfoo+bar=mail.gmail.com@mail.gmail.com>'),
  'CAEfoo+bar=mail.gmail.com@mail.gmail.com',
);
check('url: /u/1 index', extractGmailUrlUserIndex('https://mail.google.com/mail/u/1/#inbox/abc'), 1);
check(
  'url: authuser email',
  extractGmailAuthuserEmail(
    'https://mail.google.com/mail/u/0/?authuser=marc@beseensignshop.com#inbox/abc',
  ),
  'marc@beseensignshop.com',
);
check(
  'candidates: never the raw URL',
  collectGmailApiIdCandidates('https://mail.google.com/mail/u/0/#inbox/FMfcgzQxxxx').some((id) =>
    id.includes('://'),
  ),
  false,
);

const boxes = [
  { id: 'bez', googleEmail: 'bez@beseensignshop.com' },
  { id: 'contact', googleEmail: 'contact@beseensignshop.com' },
  { id: 'marc', googleEmail: 'marc@beseensignshop.com' },
];
check(
  'mailbox order: authuser then preferred then rest',
  orderMailboxesForGmailPaste(boxes, {
    preferredId: 'bez',
    pasted: 'https://mail.google.com/mail/u/0/?authuser=marc@beseensignshop.com#inbox/x',
  }).map((m) => m.id),
  ['marc', 'bez', 'contact'],
);

check(
  'parse: permthid query',
  parseGmailThreadId(`https://mail.google.com/mail/u/0/?view=pt&permthid=${hex}`),
  hex,
);
check(
  'parse: thread-a decimal to hex',
  parseGmailThreadId(`https://mail.google.com/mail/u/0/#inbox/thread-a:r-${threadFDec}`),
  hex,
);
check(
  'open error lists mailboxes',
  couldNotOpenGmailThreadMessage(['bez@beseensignshop.com', 'marc@beseensignshop.com']),
  'Could not open that conversation in bez@beseensignshop.com, marc@beseensignshop.com. Paste ⋮ Copy link from the account that has the mail.',
);
check(
  'bookmark explanation lists mailboxes tried',
  gmailBookmarkTicketExplanation(['bez@beseensignshop.com', 'contact@beseensignshop.com']),
  'Could not open that conversation (tried bez@beseensignshop.com, contact@beseensignshop.com), so QuickBooks is skipped until the mail can be read.',
);
check(
  'board toast hides API essay',
  fromGmailBoardToast({
    from_gmail_error:
      'Gmail API cannot open this conversation (bez@beseensignshop.com + “me” both failed). Paste ⋮',
  }),
  'Could not open that conversation in the connected mailboxes. Paste ⋮ Copy link from the account that has the mail.',
);
check(
  'job toast bookmark',
  fromGmailJobToast({ from_gmail: 'bookmark', qbo_error: 'Tried bez@. QuickBooks skipped.' }).ok,
  'Pre-quote ticket created with the Gmail link saved.',
);

const addonOk = new Request('http://dash.local/api', {
  headers: { Authorization: 'Bearer addon-secret' },
});
check('addon auth: bearer', gmailAddonAuthorized(addonOk, 'addon-secret'), true);
check('addon auth: wrong secret', gmailAddonAuthorized(addonOk, 'other-secret'), false);
check(
  'addon auth: lowercase bearer',
  gmailAddonAuthorized(
    new Request('http://dash.local/api', { headers: { Authorization: 'bearer addon-secret' } }),
    'addon-secret',
  ),
  true,
);
check(
  'addon auth: raw authorization',
  gmailAddonAuthorized(
    new Request('http://dash.local/api', { headers: { Authorization: 'addon-secret' } }),
    'addon-secret',
  ),
  true,
);
check(
  'addon auth: header',
  gmailAddonAuthorized(
    new Request('http://dash.local/api', { headers: { 'X-Dash-Addon-Secret': 'addon-secret' } }),
    'addon-secret',
  ),
  true,
);
check(
  'addon auth: body addonSecret',
  gmailAddonAuthorized(new Request('http://dash.local/api'), 'addon-secret', { addonSecret: 'addon-secret' }),
  true,
);
check(
  'addon auth: trims expected',
  gmailAddonAuthorized(addonOk, ' addon-secret\n'),
  true,
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
