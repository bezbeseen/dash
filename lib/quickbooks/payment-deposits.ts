/**
 * What QuickBooks shows as "Deposit paid" on an estimate: money the customer paid that no
 * invoice has absorbed yet.
 *
 * Estimate deposits are Payments with PaymentExtendedType "Prepayment", and their UnappliedAmt
 * never goes down. When the estimate is converted, QuickBooks records a separate $0 Prepayment
 * whose invoice line carries the deposit onto the invoice, so those lines are subtracted.
 */

type QboLinkedTxn = { TxnId?: string; TxnType?: string };

export type QboPaymentForDeposit = {
  Id?: string;
  TotalAmt?: number | string;
  UnappliedAmt?: number | string;
  PaymentExtendedType?: string;
  Line?: Array<{ Amount?: number | string; LinkedTxn?: QboLinkedTxn[] }>;
};

function cents(amt: number | string | undefined): number {
  if (amt == null) return 0;
  const n = typeof amt === 'number' ? amt : parseFloat(String(amt).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isPrepaymentApplication(p: QboPaymentForDeposit): boolean {
  return String(p.PaymentExtendedType ?? '').toLowerCase() === 'prepayment' && cents(p.TotalAmt) === 0;
}

export function customerDepositCentsFromPayments(payments: QboPaymentForDeposit[]): number {
  let unapplied = 0;
  let movedOntoInvoices = 0;
  for (const p of payments) {
    unapplied += cents(p.UnappliedAmt);
    if (!isPrepaymentApplication(p)) continue;
    for (const line of p.Line ?? []) {
      if (line.LinkedTxn?.some((t) => String(t.TxnType ?? '').toLowerCase() === 'invoice')) {
        movedOntoInvoices += cents(line.Amount);
      }
    }
  }
  return Math.max(0, unapplied - movedOntoInvoices);
}
