import { fetchInvoiceById, fetchInvoiceIdsLinkedToPayment, fetchPaymentCustomerId } from '@/lib/quickbooks/client';
import { persistCustomerDepositCents } from '@/lib/domain/customer-deposit';
import { upsertJobFromInvoice } from '@/lib/domain/sync';

/** Refresh Dash tickets for invoices a QBO Payment is applied to, and record any still-unapplied deposit. */
export async function upsertJobsFromQboPayment(realmId: string, paymentId: string): Promise<void> {
  const invoiceIds = await fetchInvoiceIdsLinkedToPayment(realmId, paymentId);
  for (const invoiceId of invoiceIds) {
    try {
      const invoice = await fetchInvoiceById(realmId, invoiceId);
      await upsertJobFromInvoice(invoice, { realmId });
    } catch (e) {
      console.warn('[quickbooks] payment webhook: invoice upsert failed', invoiceId, e);
    }
  }

  try {
    const customerId = await fetchPaymentCustomerId(realmId, paymentId);
    if (customerId) await persistCustomerDepositCents(realmId, customerId);
  } catch (e) {
    console.warn('[quickbooks] payment webhook: deposit refresh failed', paymentId, e);
  }
}
