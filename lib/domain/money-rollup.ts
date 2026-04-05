export function computeMoneyRollup(
  rows: {
    estimateAmountCents: number;
    invoiceAmountCents: number;
    amountPaidCents: number;
  }[],
) {
  let totalPaid = 0;
  let totalInvoiced = 0;
  let outstanding = 0;
  let totalEstimates = 0;
  let paidInFull = 0;
  let withOpenBalance = 0;

  for (const j of rows) {
    totalPaid += j.amountPaidCents;
    totalInvoiced += j.invoiceAmountCents;
    totalEstimates += j.estimateAmountCents;
    const open = Math.max(0, j.invoiceAmountCents - j.amountPaidCents);
    outstanding += open;
    if (j.invoiceAmountCents > 0 && j.amountPaidCents >= j.invoiceAmountCents) {
      paidInFull += 1;
    }
    if (open > 0) {
      withOpenBalance += 1;
    }
  }

  return {
    totalPaid,
    totalInvoiced,
    outstanding,
    totalEstimates,
    paidInFull,
    withOpenBalance,
    ticketCount: rows.length,
  };
}
