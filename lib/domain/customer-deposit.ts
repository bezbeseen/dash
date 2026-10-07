import type { Job } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { jobOpenForDepositWarning } from '@/lib/domain/estimate-deposit-check';
import { fetchCustomerUnappliedPaymentCents } from '@/lib/quickbooks/client';

export type DepositTicket = Pick<
  Job,
  'id' | 'archivedAt' | 'quickbooksEstimateId' | 'quickbooksInvoiceId' | 'estimateStatus' | 'estimateAmountCents'
>;

/**
 * Which of a customer's tickets shows the deposit QuickBooks still holds for them. QuickBooks keeps
 * that money per customer without saying which estimate it is for, so it goes on a ticket only when
 * that is the customer's one open estimate, and never above the estimate's total. Every other ticket
 * gets 0; invoiced tickets already count their deposit as invoice paid.
 */
export function attributeCustomerDeposit(heldCents: number, tickets: DepositTicket[]): Map<string, number> {
  const shares = new Map(tickets.map((t) => [t.id, 0]));
  const open = tickets.filter((t) => jobOpenForDepositWarning(t) && t.estimateAmountCents > 0);
  if (heldCents > 0 && open.length === 1) {
    shares.set(open[0].id, Math.min(heldCents, open[0].estimateAmountCents));
  }
  return shares;
}

/**
 * Store each of this customer's tickets' deposit share (see `attributeCustomerDeposit`). Only rows
 * whose amount changes are written, so a refresh does not mark every ticket as updated.
 */
export async function persistCustomerDepositCents(realmId: string, customerId: string): Promise<Map<string, number>> {
  const id = customerId.trim();
  if (!realmId.trim() || !id) return new Map();
  const [heldCents, tickets] = await Promise.all([
    fetchCustomerUnappliedPaymentCents(realmId, id),
    prisma.job.findMany({
      where: { quickbooksCustomerId: id },
      select: {
        id: true,
        archivedAt: true,
        quickbooksEstimateId: true,
        quickbooksInvoiceId: true,
        estimateStatus: true,
        estimateAmountCents: true,
        depositCents: true,
      },
    }),
  ]);
  const shares = attributeCustomerDeposit(heldCents, tickets);
  const changed = new Map<number, string[]>();
  for (const t of tickets) {
    const depositCents = shares.get(t.id) ?? 0;
    if (depositCents !== t.depositCents) changed.set(depositCents, [...(changed.get(depositCents) ?? []), t.id]);
  }
  for (const [depositCents, ids] of changed) {
    await prisma.job.updateMany({ where: { id: { in: ids } }, data: { depositCents } });
  }
  return shares;
}
