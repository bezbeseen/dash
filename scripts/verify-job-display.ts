/**
 * Ticket title + QBO estimate/payment activity (no live QBO).
 * Run `npm run verify:job-display` after changing those modules.
 */
import { EstimateStatus, InvoiceStatus } from '@prisma/client';
import {
  isGenericProjectLabel,
  isShopTicketTitle,
  jobPrimaryHeading,
  compactStoredEmailSubtitle,
  jobSecondaryHeading,
  preferHumanProjectName,
} from '../lib/domain/job-display';
import { qbDocActivityEvents } from '../lib/domain/qb-doc-activity';

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

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll job display / QBO activity checks passed.');
