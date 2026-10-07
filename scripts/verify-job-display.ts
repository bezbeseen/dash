/**
 * Ticket title, QBO estimate/payment activity, and card / ticket dates (no live QBO).
 * Run `npm run verify:job-display` after changing those modules.
 */
import { EstimateStatus, InvoiceStatus } from '@prisma/client';
import { jobCardTasks } from '../lib/domain/job-card-tasks';
import {
  isGenericProjectLabel,
  isShopTicketTitle,
  jobPrimaryHeading,
  compactStoredEmailSubtitle,
  jobSecondaryHeading,
  preferHumanProjectName,
} from '../lib/domain/job-display';
import { qbDocActivityEvents } from '../lib/domain/qb-doc-activity';
import { shopTimeZone } from '../lib/shop-time-zone';
import { fmtDetailDate, fmtDueDate, fmtQboWhen, fmtShortDate, pastDueCutoff } from '../lib/ticket/format';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  }
}

check(
  'prefer: keep preticket title over Estimate #',
  preferHumanProjectName('memorial cards', 'Estimate #1263'),
  'memorial cards',
);
check(
  'prefer: keep preticket title over Invoice #',
  preferHumanProjectName('memorial cards', 'Invoice #88'),
  'memorial cards',
);
check(
  'prefer: keep Estimate # when invoice sync would rename',
  preferHumanProjectName('Estimate #1263', 'Invoice #88'),
  'Estimate #1263',
);
check(
  'prefer: keep generic lead label rather than Estimate #',
  preferHumanProjectName('Voice call', 'Estimate #12'),
  'Voice call',
);
check(
  'prefer: upgrade Estimate # to a shop title',
  preferHumanProjectName('Estimate #12', 'Window graphics'),
  'Window graphics',
);
check('prefer: empty existing takes incoming', preferHumanProjectName('', 'Estimate #9'), 'Estimate #9');

check('generic: voice call', isGenericProjectLabel('Voice call'), true);
check('shop title: memorial cards', isShopTicketTitle('memorial cards'), true);
check('shop title: not Estimate #', isShopTicketTitle('Estimate #12'), false);

check(
  'heading: shop title wins',
  jobPrimaryHeading({ customerName: 'Jane Doe', projectName: 'memorial cards' }),
  'memorial cards',
);
check(
  'heading: QBO doc still customer + number',
  jobPrimaryHeading({ customerName: 'Jane Doe', projectName: 'Estimate #1263' }),
  'Jane Doe #1263',
);
check(
  'heading: generic lead stays customer name',
  jobPrimaryHeading({ customerName: 'Jane Doe', projectName: 'Voice call' }),
  'Jane Doe',
);
check(
  'subtitle: customer under shop title',
  jobSecondaryHeading({
    customerName: 'Jane Doe',
    projectName: 'memorial cards',
    projectDescription: null,
  }),
  'Jane Doe',
);
check(
  'subtitle: gmail card keeps email and subject, drops the body',
  compactStoredEmailSubtitle(
    'Email: mitch@kollabre.com\nSubject: Pending and for sale\n\nHi guys, Hope all is well Can we also please order 6 pending riders?',
  ),
  'mitch@kollabre.com · Pending and for sale',
);
check(
  'subtitle: shop title uses compact gmail line',
  jobSecondaryHeading({
    customerName: 'Mitch',
    projectName: 'Mitch 6 Pending 14 for sale riders',
    projectDescription:
      'Email: mitch@kollabre.com\nSubject: Pending and for sale\n\nHi guys, Hope all is well',
  }),
  'mitch@kollabre.com · Pending and for sale',
);
check('subtitle: ordinary memo stays', compactStoredEmailSubtitle('Black background, white lettering'), null);

const money = {
  estimateStatus: EstimateStatus.SENT,
  invoiceStatus: InvoiceStatus.OPEN,
  estimateAmountCents: 10000,
  invoiceAmountCents: 10000,
  amountPaidCents: 0,
  quickbooksEstimateId: 'E1',
  quickbooksInvoiceId: 'I1',
};

check(
  'activity: skip no-op sync',
  qbDocActivityEvents({ prev: money, next: money, invoiceDocNumber: '88' }),
  [],
);

const paid = qbDocActivityEvents({
  prev: money,
  next: { ...money, amountPaidCents: 4000 },
  invoiceDocNumber: '88',
});
check('activity: payment event name', paid[0]?.eventName, 'invoice.payment');
check(
  'activity: payment message',
  paid[0]?.message,
  'Invoice #88 — payment received ($40.00). Paid $40.00 of $100.00.',
);

const paidFull = qbDocActivityEvents({
  prev: money,
  next: { ...money, amountPaidCents: 10000, invoiceStatus: InvoiceStatus.PAID },
  invoiceDocNumber: '88',
});
check('activity: paid in full event', paidFull[0]?.eventName, 'invoice.paid');

const estSent = qbDocActivityEvents({
  prev: {
    ...money,
    estimateStatus: EstimateStatus.UNKNOWN,
    invoiceStatus: InvoiceStatus.NONE,
    invoiceAmountCents: 0,
    quickbooksInvoiceId: null,
  },
  next: {
    ...money,
    invoiceStatus: InvoiceStatus.NONE,
    invoiceAmountCents: 0,
    amountPaidCents: 0,
    quickbooksInvoiceId: null,
  },
  estimateDocNumber: '12',
});
check('activity: estimate sent', estSent[0]?.eventName, 'estimate.sent');
check('activity: estimate sent message', estSent[0]?.message, 'Estimate #12 marked sent in QuickBooks.');

// ---- Card / ticket dates use the shop's time zone, not the server's (UTC on Vercel)
process.env.TZ = 'UTC';
delete process.env.QUICKBOOKS_REPORT_TIMEZONE;
/** Newer ICU puts a narrow no-break space before AM/PM. */
const plain = (s: string) => s.replace(/\u202f/g, ' ');
const lateMorningUtc = new Date('2026-10-07T19:25:00.000Z');
const eveningLa = new Date('2026-10-08T02:25:00.000Z');
check('time zone: defaults to Los Angeles', shopTimeZone(), 'America/Los_Angeles');
check('time zone: 19:25 UTC shows as 12:25 PM', plain(fmtDetailDate(lateMorningUtc)), 'Oct 7, 2026, 12:25 PM');
check('time zone: evening stays on the shop day', plain(fmtDetailDate(eveningLa)), 'Oct 7, 2026, 7:25 PM');
check('time zone: short date uses the shop day', fmtShortDate(eveningLa), 'Oct 7, 2026');
check('time zone: winter is PST', plain(fmtDetailDate(new Date('2026-01-15T20:00:00.000Z'))), 'Jan 15, 2026, 12:00 PM');
check('time zone: QuickBooks times convert', plain(fmtQboWhen('2026-10-01T18:30:00-07:00')), 'Oct 1, 2026, 6:30 PM');
check('time zone: QuickBooks dates keep their day', fmtQboWhen('2026-10-01'), 'Oct 1, 2026');
check('due: a typed due date keeps its day', fmtDueDate(new Date('2026-10-09')), 'Oct 9, 2026');
check('due: not overdue on its own day', new Date('2026-10-07') < pastDueCutoff(eveningLa), false);
check('due: overdue the next day', new Date('2026-10-06') < pastDueCutoff(eveningLa), true);
check(
  'due: card task rows',
  jobCardTasks(
    [
      { id: 't1', title: 'Call about vinyl', assigneeEmail: null, dueAt: new Date('2026-10-06') },
      { id: 't2', title: 'Order substrate', assigneeEmail: 'ben@example.com', dueAt: new Date('2026-10-07') },
      { id: 't3', title: 'Proof', assigneeEmail: null, dueAt: null },
    ],
    eveningLa,
  ).map((t) => [t.dueLabel, t.overdue]),
  [
    ['Oct 6, 2026', true],
    ['Oct 7, 2026', false],
    [null, false],
  ],
);
process.env.QUICKBOOKS_REPORT_TIMEZONE = 'America/New_York';
check('time zone: QUICKBOOKS_REPORT_TIMEZONE overrides', plain(fmtDetailDate(eveningLa)), 'Oct 7, 2026, 10:25 PM');
delete process.env.QUICKBOOKS_REPORT_TIMEZONE;

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll job display / QBO activity checks passed.');
