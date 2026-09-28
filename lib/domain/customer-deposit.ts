import { prisma } from '@/lib/db/prisma';
import { fetchCustomerUnappliedPaymentCents } from '@/lib/quickbooks/client';

/** Store this customer's unapplied QuickBooks payments on each of their tickets. */
export async function persistCustomerDepositCents(realmId: string, customerId: string): Promise<number> {
  const id = customerId.trim();
  if (!realmId.trim() || !id) return 0;
  const depositCents = await fetchCustomerUnappliedPaymentCents(realmId, id);
  await prisma.job.updateMany({
    where: { quickbooksCustomerId: id },
    data: { depositCents },
  });
  return depositCents;
}
