/**
 * What QuickBooks shows as "Deposit paid" on an estimate: money the customer paid that no
 * invoice has absorbed yet.
 *
 * Estimate deposits are Payments with PaymentExtendedType "Prepayment", and their UnappliedAmt
 * never goes down. Once a deposit reaches an invoice, one of these records it there, and it is
 * subtracted here:
 * - Converting the estimate records a separate $0 Prepayment whose invoice line carries the
 *   deposit onto the invoice.
 * - A deposit paid online (QuickBooks Payments) turns the estimate into an invoice and records
 *   the same card charge again as an ordinary payment on it (same CCTransId).
 * - The invoice's own Deposit field takes the amount (`invoiceDepositCents`).
 */

type QboLinkedTxn = { TxnId?: string; TxnType?: string };

export type QboPaymentForDeposit = {
  Id?: string;
  TotalAmt?: number | string;
  UnappliedAmt?: number | string;
  PaymentExtendedType?: string;
  CreditCardPayment?: { CreditChargeResponse?: { CCTransId?: string } };
  Line?: Array<{ Amount?: number | string; LinkedTxn?: QboLinkedTxn[] }>;
};

function cents(amt: number | string | undefined): number {
  if (amt == null) return 0;
  const n = typeof amt === 'number' ? amt : parseFloat(String(amt).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function isPrepayment(p: QboPaymentForDeposit): boolean {
  return String(p.PaymentExtendedType ?? '').toLowerCase() === 'prepayment';
}

function isPrepaymentApplication(p: QboPaymentForDeposit): boolean {
  return isPrepayment(p) && cents(p.TotalAmt) === 0;
}

function cardChargeId(p: QboPaymentForDeposit): string | null {
  return p.CreditCardPayment?.CreditChargeResponse?.CCTransId?.trim() || null;
}

export function customerDepositCentsFromPayments(
  payments: QboPaymentForDeposit[],
  invoiceDepositCents = 0,
): number {
  const chargedAgain = new Map<string, number>();
  for (const p of payments) {
    const charge = cardChargeId(p);
    if (charge && !isPrepayment(p)) chargedAgain.set(charge, (chargedAgain.get(charge) ?? 0) + cents(p.TotalAmt));
  }

  let unapplied = 0;
  let movedOntoInvoices = invoiceDepositCents;
  for (const p of payments) {
    let held = cents(p.UnappliedAmt);
    const charge = isPrepayment(p) ? cardChargeId(p) : null;
    if (charge && held > 0) {
      const twin = chargedAgain.get(charge) ?? 0;
      const same = Math.min(held, twin);
      held -= same;
      chargedAgain.set(charge, twin - same);
    }
    unapplied += held;
    if (!isPrepaymentApplication(p)) continue;
    for (const line of p.Line ?? []) {
      if (line.LinkedTxn?.some((t) => String(t.TxnType ?? '').toLowerCase() === 'invoice')) {
        movedOntoInvoices += cents(line.Amount);
      }
    }
  }
  return Math.max(0, unapplied - movedOntoInvoices);
}
