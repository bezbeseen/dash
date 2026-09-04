/**
 * Checks the ticket → Gmail thread matcher. The rule that matters is that an ambiguous or
 * weak match never auto-links, so most of these assert what does NOT happen.
 * Run `npm run verify:thread-matcher` after changing lib/gmail/thread-match.ts.
 */
import {
  buildCounterpartyFilter,
  buildJobMatchProfile,
  buildThreadSearchPlan,
  classifyParticipant,
  decideThreadMatch,
  emailComparisonKey,
  normalizeEmailAddress,
  normalizeSubject,
  parseAddressEntries,
  parseStoredThreadSuggestions,
  scoreThreadCandidate,
  toStoredThreadSuggestion,
  type CounterpartyFilter,
  type JobMatchProfile,
  type ScoredThreadCandidate,
  type ThreadCandidate,
} from '../lib/gmail/thread-match';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const MAILBOXES = ['contact@beseensignshop.com', 'bez@beseensignshop.com', 'shopowner@gmail.com'];
const filter = buildCounterpartyFilter(MAILBOXES);

function candidate(over: Partial<ThreadCandidate> & { threadId: string }): ThreadCandidate {
  return {
    gmailConnectionId: 'conn1',
    mailboxEmail: 'contact@beseensignshop.com',
    subject: '',
    snippet: '',
    participants: [],
    messageCount: 1,
    lastMessageAt: '2026-09-01T00:00:00.000Z',
    foundBy: 'lead_email_address',
    foundByLabel: 'test',
    ...over,
  };
}

function withParticipants(threadId: string, addresses: string[], subject = ''): ThreadCandidate {
  return candidate({
    threadId,
    subject,
    participants: addresses.map((address) => ({ address, name: '' })),
  });
}

function score(profile: JobMatchProfile, c: ThreadCandidate, f: CounterpartyFilter = filter): ScoredThreadCandidate {
  return scoreThreadCandidate(profile, c, f);
}

// ---- address normalization
check('normalize: display name form', normalizeEmailAddress('  Jane Doe <Jane.Doe@Example.COM> '), 'jane.doe@example.com');
check('normalize: mailto prefix', normalizeEmailAddress('mailto:Bob@Shop.io'), 'bob@shop.io');
check('normalize: junk returns null', normalizeEmailAddress('  not an address '), null);
check('normalize: plus tag survives verbatim', normalizeEmailAddress('jane+signs@example.com'), 'jane+signs@example.com');
check('compare key: strips plus tag', emailComparisonKey('jane+signs@example.com'), 'jane@example.com');
check('compare key: gmail dots ignored', emailComparisonKey('Jane.Doe@GoogleMail.com'), 'janedoe@gmail.com');
check('compare key: dots kept off gmail', emailComparisonKey('jane.doe@example.com'), 'jane.doe@example.com');

check(
  'address list: comma inside quoted display name',
  parseAddressEntries('"Doe, Jane" <jane@example.com>, Bob <bob@other.com>').map((e) => e.address),
  ['jane@example.com', 'bob@other.com'],
);
check(
  'address list: display name kept',
  parseAddressEntries('"Doe, Jane" <jane@example.com>')[0]?.name,
  'Doe, Jane',
);
check('address list: empty header', parseAddressEntries(''), []);

// ---- subject normalization
check('subject: strips stacked Re/Fwd', normalizeSubject('Re: FWD:  Re: Channel letter quote'), 'Channel letter quote');
check('subject: collapses whitespace', normalizeSubject('  Sign   quote \n '), 'Sign quote');

// ---- participant classification
check('own mailbox excluded', classifyParticipant('CONTACT@beseensignshop.com', filter), 'own');
check('own private domain alias excluded', classifyParticipant('sales@beseensignshop.com', filter), 'own');
check(
  'connected gmail.com mailbox does not make gmail.com ours',
  classifyParticipant('somecustomer@gmail.com', filter),
  'counterparty',
);
check('no-reply excluded', classifyParticipant('no-reply@somewhere.com', filter), 'automated');
check('donotreply excluded', classifyParticipant('DoNotReply@vendor.io', filter), 'automated');
check('intuit excluded', classifyParticipant('quickbooks@notification.intuit.com', filter), 'automated');
check('google excluded', classifyParticipant('drive-shares-dm-noreply@google.com', filter), 'automated');
check('yelp notification excluded', classifyParticipant('no-reply@yelp.com', filter), 'automated');
check('yelp reply proxy kept', classifyParticipant('jane.doe.9f2c@messaging.yelp.com', filter), 'counterparty');
check('ordinary customer kept', classifyParticipant('Jane@AcmeSigns.com', filter), 'counterparty');

// ---- profile building
const leadProfile = buildJobMatchProfile(
  {
    jobId: 'job1',
    customerName: 'Acme Signs',
    projectName: 'Estimate #1263',
    projectDescription: 'Reply to: billing@acmesigns.com\nSent to contact@beseensignshop.com',
    linkedEmails: [
      { fromAddr: ' Jane Doe <JANE@acmesigns.com> ', toAddr: 'contact@beseensignshop.com', linkUrl: null, notes: null },
    ],
  },
  filter,
);
check('profile: lead address normalized', leadProfile.leadAddresses, ['jane@acmesigns.com']);
check('profile: own mailbox dropped from lead addresses', leadProfile.leadAddresses.length, 1);
check('profile: description address is a weaker ticket address', leadProfile.ticketAddresses, ['billing@acmesigns.com']);
check('profile: doc ref parsed', leadProfile.docRef, '1263');

const noiseProfile = buildJobMatchProfile(
  {
    jobId: 'job2',
    customerName: 'Nobody',
    projectName: 'Estimate #9',
    linkedEmails: [{ fromAddr: 'no-reply@yelp.com', toAddr: 'contact@beseensignshop.com', linkUrl: null, notes: null }],
  },
  filter,
);
check('profile: vendor + own mailbox leave no address to search on', noiseProfile.leadAddresses, []);
check('profile: and no weaker address either', noiseProfile.ticketAddresses, []);
check(
  'plan: bulk mode has nothing to run for an address-less ticket',
  buildThreadSearchPlan(noiseProfile, { addressSignalsOnly: true }).length,
  0,
);

// ---- search plan
const plan = buildThreadSearchPlan(leadProfile, { lookbackDays: 90 });
check('plan: strongest step first', plan[0]?.signal, 'lead_email_address');
check(
  'plan: address query covers from/to/cc and the window',
  plan[0]?.query,
  '(from:jane@acmesigns.com OR to:jane@acmesigns.com OR cc:jane@acmesigns.com) newer_than:90d -in:chats -in:drafts',
);
check('plan: second step is the weaker ticket address', plan[1]?.signal, 'ticket_email_address');
check('plan: doc ref searched by subject', plan[2]?.signal, 'subject_doc_ref');
check(
  'plan: addressSignalsOnly drops subject and name searches',
  buildThreadSearchPlan(leadProfile, { addressSignalsOnly: true }).map((s) => s.signal),
  ['lead_email_address', 'ticket_email_address'],
);

const quoteInjection = buildJobMatchProfile(
  { jobId: 'job3', customerName: 'Vault "Bar" (LLC)', projectName: 'Neon sign for "The Vault"' },
  filter,
);
const injectionPlan = buildThreadSearchPlan(quoteInjection, { lookbackDays: 30 });
check(
  'plan: quotes and parens stripped out of a project name phrase',
  injectionPlan.find((s) => s.signal === 'subject_project_name')?.query,
  'subject:"Neon sign for The Vault" newer_than:30d -in:chats -in:drafts',
);
check(
  'plan: quotes and parens stripped out of a customer name phrase',
  injectionPlan.find((s) => s.signal === 'customer_name')?.query,
  '"Vault Bar LLC" newer_than:30d -in:chats -in:drafts',
);

// ---- scoring
const exact = score(leadProfile, withParticipants('t1', ['jane@acmesigns.com', 'contact@beseensignshop.com']));
check('score: exact lead address match', exact.score, 95);
check('score: signal recorded', exact.signals, ['lead_email_address']);
check('score: our own mailbox is not a counterparty', exact.counterparties, ['jane@acmesigns.com']);

const taggedAddress = score(leadProfile, withParticipants('t1b', ['Jane+quotes@AcmeSigns.com']));
check('score: plus-tagged spelling of the lead address still matches', taggedAddress.score, 95);

const twoSignals = score(
  leadProfile,
  withParticipants('t2', ['jane@acmesigns.com'], 'Re: Estimate 1263 for Acme Signs'),
);
check('score: agreeing signals add a small bonus, capped', twoSignals.score, 98);
check('score: three signals recorded', twoSignals.signals.length, 3);

const ownOnly = score(leadProfile, withParticipants('t3', ['contact@beseensignshop.com', 'no-reply@yelp.com']));
check('score: thread with no outside participant scores zero', ownOnly.score, 0);
check(
  'score: reason explains the exclusion',
  ownOnly.reasons[0]?.includes('No outside participant'),
  true,
);

const unrelated = score(leadProfile, withParticipants('t4', ['someone@else.com'], 'Lunch tomorrow'));
check('score: unrelated thread scores zero', unrelated.score, 0);

const nameOnlyProfile = buildJobMatchProfile(
  { jobId: 'job4', customerName: 'Marcus Tellier', projectName: 'Estimate #77' },
  filter,
);
const nameOnly = score(
  nameOnlyProfile,
  withParticipants('t5', ['mt@somewhere.com'], 'Signage for  MARCUS   TELLIER!'),
);
check('score: name-only match is weak', nameOnly.score, 40);
check('score: name match survives case and spacing', nameOnly.signals, ['customer_name']);

const nameOnParticipant = score(
  nameOnlyProfile,
  candidate({
    threadId: 't6',
    subject: 'Quick question',
    participants: [{ address: 'mt@somewhere.com', name: 'Marcus Tellier' }],
  }),
);
check('score: display name counts as the weak name signal', nameOnParticipant.score, 40);

const docRefOnly = score(leadProfile, withParticipants('t7', ['other@corp.com'], 'Re: Estimate 1263'));
check('score: doc ref in subject alone', docRefOnly.score, 70);

const docRefSubstring = score(leadProfile, withParticipants('t8', ['other@corp.com'], 'Order 126399 shipped'));
check('score: doc ref must be a whole token', docRefSubstring.score, 0);

const yelpProfile = buildJobMatchProfile(
  {
    jobId: 'job5',
    customerName: 'Jane D.',
    projectName: 'Yelp · Storefront Signs',
    linkedEmails: [{ fromAddr: 'jane.doe.9f2c@messaging.yelp.com', toAddr: null, linkUrl: null, notes: null }],
  },
  filter,
);
const yelpThread = score(
  yelpProfile,
  withParticipants('t9', ['jane.doe.9f2c@messaging.yelp.com', 'no-reply@yelp.com']),
);
check('score: yelp reply proxy matches as the customer', yelpThread.score, 95);
check('score: yelp notification sender is not a counterparty', yelpThread.counterparties, [
  'jane.doe.9f2c@messaging.yelp.com',
]);

// ---- decisions
check('decide: nothing found', decideThreadMatch([]).action, 'none');
check('decide: single exact address match auto-links', decideThreadMatch([exact]).action, 'auto_link');

const secondThread = score(leadProfile, withParticipants('t-other', ['jane@acmesigns.com'], 'Second job'));
const ambiguous = decideThreadMatch([exact, secondThread]);
check('decide: two threads for the same address must NOT auto-link', ambiguous.action, 'suggest');
check('decide: both are offered as suggestions', ambiguous.suggestions.length, 2);

check('decide: doc-ref-only match only suggests', decideThreadMatch([docRefOnly]).action, 'suggest');
check('decide: name-only match only suggests', decideThreadMatch([nameOnly]).action, 'suggest');
check('decide: zero-score candidates are not even suggested', decideThreadMatch([ownOnly, unrelated]).action, 'none');

const strongPlusWeak = decideThreadMatch([exact, nameOnly]);
check('decide: a weak rival does not block a strong unique match', strongPlusWeak.action, 'auto_link');
check('decide: the strong match is the one chosen', strongPlusWeak.best?.threadId, 't1');

const duplicateThread = decideThreadMatch([exact, score(leadProfile, withParticipants('t1', ['jane@acmesigns.com']))]);
check('decide: same thread found twice is not ambiguity', duplicateThread.action, 'auto_link');

// ---- suggestion round trip through ActivityLog metadata
const stored = { candidates: ambiguous.suggestions.map(toStoredThreadSuggestion) };
const roundTripped = parseStoredThreadSuggestions(JSON.parse(JSON.stringify(stored)));
check('stored: survives a JSON round trip', roundTripped.length, 2);
check('stored: thread id preserved', roundTripped[0]?.threadId, ambiguous.suggestions[0]?.threadId);
check('stored: junk metadata yields nothing', parseStoredThreadSuggestions({ candidates: 'nope' }), []);
check('stored: null metadata yields nothing', parseStoredThreadSuggestions(null), []);
check(
  'stored: entries without a mailbox connection are dropped',
  parseStoredThreadSuggestions({ candidates: [{ threadId: 'x' }] }),
  [],
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
