/**
 * Customer CRM money rollup + QBO overlay (no live QBO).
 * Run `npm run verify:customers-money` after changing those modules.
 */
import { EstimateStatus, InvoiceStatus } from '@prisma/client';
import {
  jobOutstandingCents,
  rollupCustomersFromJobs,
  type CustomerJobRollupInput,
} from '../lib/domain/customers';
import { displayJobMoney, jobMoneyNeedsPersist, type JobMoneyFields } from '../lib/domain/hydrate-job-money';
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
    archivedAt: null,
    estimateAmountCents: 89459,
    invoiceAmountCents: 89459,
    amountPaidCents: 89459,
    updatedAt: day(2),
  },
  {
    customerName: 'Kollab',
    quickbooksCustomerId: '11',
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

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll customer money checks passed.');
