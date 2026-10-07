/**
 * Customer CRM money rollup + QBO overlay, deposits and which ticket shows them (no live QBO).
 * Run `npm run verify:customers-money` after changing those modules.
 */
import { EstimateStatus, InvoiceStatus } from '@prisma/client';
import {
  jobOutstandingCents,
  rollupCustomersFromJobs,
  type CustomerJobRollupInput,
} from '../lib/domain/customers';
import { attributeCustomerDeposit, type DepositTicket } from '../lib/domain/customer-deposit';
import { estimateStatusFromQbo } from '../lib/domain/derive-board-status';
import { displayJobMoney, jobMoneyNeedsPersist, type JobMoneyFields } from '../lib/domain/hydrate-job-money';
import { customerDepositCentsFromPayments, type QboPaymentForDeposit } from '../lib/quickbooks/payment-deposits';
import type { EstimateSnapshot, InvoiceSnapshot } from '../lib/quickbooks/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  }
}

const day = (n: number) => new Date(`2026-01-0${n}T12:00:00.000Z`);

const stored: JobMoneyFields = {
  estimateAmountCents: 10000,
  invoiceAmountCents: 20000,
  amountPaidCents: 5000,
  estimateStatus: EstimateStatus.SENT,
  invoiceStatus: InvoiceStatus.OPEN,
};

check('outstanding: invoice minus paid', jobOutstandingCents(stored), 15000);
check('outstanding: never negative', jobOutstandingCents({ invoiceAmountCents: 100, amountPaidCents: 400 }), 0);

const liveEstimate: EstimateSnapshot = {
  id: 'e1',
  customerName: 'Kollab',
  projectName: 'Estimate #1',
  totalAmtCents: 89459,
  status: 'UNKNOWN',
};

const liveInvoice: InvoiceSnapshot = {
  id: 'i1',
  customerName: 'Kollab',
  totalAmtCents: 89459,
  balanceCents: 0,
  amountPaidCents: 89459,
  balanceKnown: true,
  status: 'PAID',
};

const overlaid = displayJobMoney(stored, { estimate: liveEstimate, invoice: liveInvoice });
check('hydrate: live estimate total', overlaid.estimateAmountCents, 89459);
check('hydrate: keep stored estimate status when QBO status is UNKNOWN', overlaid.estimateStatus, EstimateStatus.SENT);
const approvedOnBoard: JobMoneyFields = { ...stored, estimateStatus: EstimateStatus.ACCEPTED };
check(
  'hydrate: QBO "Pending" does not pull a board approval back to Quoted',
  displayJobMoney(approvedOnBoard, { estimate: { ...liveEstimate, status: 'SENT' }, invoice: null }).estimateStatus,
  EstimateStatus.ACCEPTED,
);
check(
  'hydrate: an explicit QBO rejection still wins',
  displayJobMoney(approvedOnBoard, { estimate: { ...liveEstimate, status: 'REJECTED' }, invoice: null }).estimateStatus,
  EstimateStatus.REJECTED,
);
check(
  'hydrate: QBO acceptance moves a quoted ticket to Approved',
  displayJobMoney(stored, { estimate: { ...liveEstimate, status: 'ACCEPTED' }, invoice: null }).estimateStatus,
  EstimateStatus.ACCEPTED,
);
check('estimate status: new ticket takes QBO as-is', estimateStatusFromQbo(null, EstimateStatus.SENT), EstimateStatus.SENT);
check('hydrate: live invoice total', overlaid.invoiceAmountCents, 89459);
check('hydrate: live payments / deposits', overlaid.amountPaidCents, 89459);
check('hydrate: live invoice status', overlaid.invoiceStatus, InvoiceStatus.PAID);
check('hydrate: persist when paid changed', jobMoneyNeedsPersist(stored, overlaid), true);

const noLive = displayJobMoney(stored, { estimate: null, invoice: null });
check('hydrate: stored estimate when QBO missing', noLive.estimateAmountCents, stored.estimateAmountCents);
check('hydrate: stored invoice when QBO missing', noLive.invoiceAmountCents, stored.invoiceAmountCents);
check('hydrate: stored paid when QBO missing', noLive.amountPaidCents, stored.amountPaidCents);
check('hydrate: no persist when unchanged', jobMoneyNeedsPersist(stored, noLive), false);

const zeroLiveEstimate = displayJobMoney(
  { ...stored, estimateAmountCents: 586450 },
  { estimate: { ...liveEstimate, totalAmtCents: 0 }, invoice: null },
);
check('hydrate: do not wipe a stored estimate with a $0 GET', zeroLiveEstimate.estimateAmountCents, 586450);

const untrustedPaid = displayJobMoney(stored, {
  estimate: null,
  invoice: { ...liveInvoice, balanceKnown: false, amountPaidCents: 0 },
});
check('hydrate: ignore unpaid when Balance was omitted', untrustedPaid.amountPaidCents, 5000);

const jobs: CustomerJobRollupInput[] = [
  {
    customerName: 'Kollab',
    quickbooksCustomerId: '11',
    quickbooksEstimateId: 'e1',
    quickbooksInvoiceId: 'i1',
    archivedAt: null,
    estimateAmountCents: 89459,
    invoiceAmountCents: 89459,
    amountPaidCents: 89459,
    updatedAt: day(2),
  },
  {
    customerName: 'Kollab',
    quickbooksCustomerId: '11',
    quickbooksInvoiceId: 'i2',
    archivedAt: null,
    estimateAmountCents: 0,
    invoiceAmountCents: 19755,
    amountPaidCents: 0,
    updatedAt: day(3),
  },
];
const rows = rollupCustomersFromJobs(jobs);
check('rollup: one customer', rows.length, 1);
check('rollup: estimated sum', rows[0]?.estimatedCents, 89459);
check('rollup: invoiced sum', rows[0]?.invoicedCents, 109214);
check('rollup: paid / deposits sum', rows[0]?.paidCents, 89459);
check('rollup: outstanding from unpaid invoice', rows[0]?.outstandingCents, 19755);

const withLead = rollupCustomersFromJobs([
  ...jobs,
  {
    customerName: 'Walk-in lead',
    quickbooksCustomerId: null,
    archivedAt: null,
    estimateAmountCents: 0,
    invoiceAmountCents: 0,
    amountPaidCents: 0,
    updatedAt: day(4),
  },
  {
    customerName: 'Preview only',
    quickbooksCustomerId: '99',
    quickbooksInvoiceId: 'csv-preview',
    archivedAt: null,
    estimateAmountCents: 100,
    invoiceAmountCents: 100,
    amountPaidCents: 0,
    updatedAt: day(5),
  },
]);
check('rollup: leads and preview ids stay off the list', withLead.map((row) => row.name), ['Kollab']);

const withHistory = rollupCustomersFromJobs([
  ...jobs,
  {
    customerName: 'Kollab',
    quickbooksCustomerId: null,
    archivedAt: day(1),
    estimateAmountCents: 0,
    invoiceAmountCents: 0,
    amountPaidCents: 0,
    updatedAt: day(1),
  },
]);
check('rollup: name-only history stays on the QuickBooks customer', withHistory.length, 1);
check('rollup: historical ticket counts as archived', withHistory[0]?.archivedJobCount, 1);
check('rollup: open tickets stay the estimate jobs', withHistory[0]?.openJobCount, 2);

// ---- QuickBooks deposits: an estimate deposit stops counting once it moves onto the invoice
const estimateDeposit: QboPaymentForDeposit = {
  Id: '5803',
  TotalAmt: 287.55,
  UnappliedAmt: 287.55,
  PaymentExtendedType: 'Prepayment',
  Line: [],
};
const depositMovedOntoInvoice: QboPaymentForDeposit = {
  Id: '6267',
  TotalAmt: 0,
  UnappliedAmt: 0,
  PaymentExtendedType: 'Prepayment',
  Line: [
    { Amount: 287.55, LinkedTxn: [{ TxnId: '6265', TxnType: 'Invoice' }] },
    { Amount: 287.55, LinkedTxn: [{ TxnId: '6266', TxnType: 'JournalEntry' }] },
  ],
};
check('deposit: counts while the job is still an estimate', customerDepositCentsFromPayments([estimateDeposit]), 28755);
check(
  'deposit: zero once the estimate converts (the invoice shows it as paid)',
  customerDepositCentsFromPayments([estimateDeposit, depositMovedOntoInvoice]),
  0,
);
check(
  'deposit: another open estimate deposit still counts',
  customerDepositCentsFromPayments([
    estimateDeposit,
    depositMovedOntoInvoice,
    { Id: '7000', TotalAmt: '500.00', UnappliedAmt: '500.00', PaymentExtendedType: 'Prepayment' },
  ]),
  50000,
);
check(
  'deposit: unapplied part of an ordinary payment counts',
  customerDepositCentsFromPayments([
    { Id: '1', TotalAmt: 100, UnappliedAmt: 40, Line: [{ Amount: 60, LinkedTxn: [{ TxnId: '9', TxnType: 'Invoice' }] }] },
  ]),
  4000,
);
check('deposit: never negative', customerDepositCentsFromPayments([depositMovedOntoInvoice]), 0);

// ---- Deposits paid online: the estimate becomes an invoice and QuickBooks records the charge twice
const onlineDeposit: QboPaymentForDeposit = {
  Id: '5810',
  TotalAmt: 818.44,
  UnappliedAmt: 818.44,
  PaymentExtendedType: 'Prepayment',
  CreditCardPayment: { CreditChargeResponse: { CCTransId: 'cc-1' } },
  Line: [],
};
const sameChargeOnInvoice: QboPaymentForDeposit = {
  Id: '5812',
  TotalAmt: 818.44,
  UnappliedAmt: 0,
  CreditCardPayment: { CreditChargeResponse: { CCTransId: 'cc-1' } },
  Line: [{ Amount: 818.44, LinkedTxn: [{ TxnId: '5811', TxnType: 'Invoice' }] }],
};
check('deposit: online deposit counts until its invoice exists', customerDepositCentsFromPayments([onlineDeposit]), 81844);
check(
  'deposit: the same card charge on the invoice cancels the prepayment copy',
  customerDepositCentsFromPayments([onlineDeposit, sameChargeOnInvoice]),
  0,
);
check(
  'deposit: an unapplied rest of that charge counts once',
  customerDepositCentsFromPayments([
    onlineDeposit,
    {
      ...sameChargeOnInvoice,
      UnappliedAmt: 18.44,
      Line: [{ Amount: 800, LinkedTxn: [{ TxnId: '5811', TxnType: 'Invoice' }] }],
    },
  ]),
  1844,
);
check(
  'deposit: a different card charge is not the same money',
  customerDepositCentsFromPayments([
    onlineDeposit,
    { ...sameChargeOnInvoice, CreditCardPayment: { CreditChargeResponse: { CCTransId: 'cc-2' } } },
  ]),
  81844,
);
check(
  "deposit: an invoice's Deposit field absorbs a hand-entered prepayment",
  customerDepositCentsFromPayments(
    [{ Id: '3179', TotalAmt: 1636.88, UnappliedAmt: 1636.88, PaymentExtendedType: 'Prepayment' }],
    163688,
  ),
  0,
);

// ---- Which ticket shows a customer's held deposit (QuickBooks does not say which estimate it is for)
const estimateTicket = (id: string, estimateAmountCents: number, extra: Partial<DepositTicket> = {}): DepositTicket => ({
  id,
  archivedAt: null,
  quickbooksEstimateId: `est-${id}`,
  quickbooksInvoiceId: null,
  estimateStatus: EstimateStatus.SENT,
  estimateAmountCents,
  ...extra,
});
const invoicedTicket = estimateTicket('inv', 355840, { quickbooksInvoiceId: '6282' });
const shares = (heldCents: number, tickets: DepositTicket[]) =>
  Object.fromEntries(attributeCustomerDeposit(heldCents, tickets));

check(
  'attribution: the one open estimate gets the held deposit',
  shares(110210, [estimateTicket('a', 212188), invoicedTicket]),
  { a: 110210, inv: 0 },
);
check('attribution: never more than that estimate total', shares(181844, [estimateTicket('a', 65000)]), { a: 65000 });
check(
  'attribution: two open estimates is ambiguous, neither shows it',
  shares(50000, [estimateTicket('a', 65000), estimateTicket('b', 90000)]),
  { a: 0, b: 0 },
);
check(
  'attribution: archived, rejected and $0 estimates are not candidates',
  shares(50000, [
    estimateTicket('a', 65000),
    estimateTicket('old', 90000, { archivedAt: day(1) }),
    estimateTicket('no', 90000, { estimateStatus: EstimateStatus.REJECTED }),
    estimateTicket('zero', 0),
  ]),
  { a: 50000, old: 0, no: 0, zero: 0 },
);
check('attribution: nothing held clears every ticket', shares(0, [estimateTicket('a', 65000)]), { a: 0 });
const ariaHeld = customerDepositCentsFromPayments([
  onlineDeposit,
  sameChargeOnInvoice,
  {
    Id: '6195',
    TotalAmt: 1000,
    UnappliedAmt: 1000,
    PaymentExtendedType: 'Prepayment',
    CreditCardPayment: { CreditChargeResponse: { CCTransId: 'cc-3' } },
  },
  {
    Id: '6197',
    TotalAmt: 1000,
    UnappliedAmt: 0,
    CreditCardPayment: { CreditChargeResponse: { CCTransId: 'cc-3' } },
    Line: [{ Amount: 1000, LinkedTxn: [{ TxnId: '6196', TxnType: 'Invoice' }] }],
  },
]);
check(
  'attribution: deposits already on invoices leave an open $650 estimate at $0 (was $1,818.44)',
  shares(ariaHeld, [estimateTicket('1347', 65000), invoicedTicket]),
  { 1347: 0, inv: 0 },
);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll customer money checks passed.');
