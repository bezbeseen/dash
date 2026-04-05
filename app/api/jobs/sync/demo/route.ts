import { NextResponse } from 'next/server';
import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';

/** Hard-coded demo jobs for local UI testing only (not QuickBooks). */
export async function POST() {
  await upsertJobFromEstimate({
    id: `est_${Date.now()}`,
    customerId: 'demo-customer',
    customerName: 'New Demo Customer',
    projectName: 'A-Frame Sign',
    totalAmtCents: 27500,
    status: 'SENT',
    txnDate: new Date().toISOString(),
  });

  await upsertJobFromInvoice({
    id: `inv_${Date.now()}`,
    linkedEstimateId: undefined,
    customerId: 'demo-customer-2',
    customerName: 'Paid Demo Customer',
    totalAmtCents: 40000,
    balanceCents: 0,
    amountPaidCents: 40000,
    status: 'PAID',
  });

  return NextResponse.redirect(new URL('/dashboard/tickets', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
}
