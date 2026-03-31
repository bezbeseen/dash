import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';
import { listRecentEstimates, listRecentInvoices } from '@/lib/quickbooks/client';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Syncs recent Estimates + Invoices from QuickBooks into local jobs.
 * Requires a successful Connect QuickBooks (QuickBooksToken row).
 */
export async function POST() {
  const token = await prisma.quickBooksToken.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!token) {
    return NextResponse.redirect(new URL('/dashboard?sync_error=no_tokens', baseUrl()));
  }

  try {
    const [estimates, invoices] = await Promise.all([
      listRecentEstimates(token.realmId, 50),
      listRecentInvoices(token.realmId, 50),
    ]);

    const { realmId } = token;
    for (const est of estimates) {
      await upsertJobFromEstimate(est, { realmId });
    }
    for (const inv of invoices) {
      await upsertJobFromInvoice(inv, { realmId });
    }

    const params = new URLSearchParams({
      synced: '1',
      e: String(estimates.length),
      i: String(invoices.length),
    });
    if (estimates.length === 0 && invoices.length === 0) {
      params.set('sync_warn', 'empty');
    }
    return NextResponse.redirect(new URL(`/dashboard?${params.toString()}`, baseUrl()));
  } catch (e) {
    const msg = e instanceof Error ? encodeURIComponent(e.message) : 'sync_failed';
    return NextResponse.redirect(new URL(`/dashboard?sync_error=${msg}`, baseUrl()));
  }
}
