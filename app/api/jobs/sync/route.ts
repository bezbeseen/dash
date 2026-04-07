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
  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, realmId: true },
  });
  if (!token) {
    return NextResponse.redirect(new URL('/dashboard/tickets?sync_error=no_tokens', baseUrl()));
  }

  try {
    const [estimates, invoices] = await Promise.all([
      listRecentEstimates(token.realmId, 100),
      listRecentInvoices(token.realmId, 100),
    ]);

    const { realmId } = token;
    for (const est of estimates) {
      await upsertJobFromEstimate(est, { realmId });
    }
    for (const inv of invoices) {
      await upsertJobFromInvoice(inv, { realmId });
    }

    try {
      await prisma.quickBooksToken.update({
        where: { id: token.id },
        data: { lastTicketSyncAt: new Date() },
        select: { id: true },
      });
    } catch {
      /* e.g. migration not applied yet — sync still succeeded */
    }

    const params = new URLSearchParams({
      synced: '1',
      e: String(estimates.length),
      i: String(invoices.length),
    });
    if (estimates.length === 0 && invoices.length === 0) {
      params.set('sync_warn', 'empty');
    }
    return NextResponse.redirect(new URL(`/dashboard/tickets?${params.toString()}`, baseUrl()));
  } catch (e) {
    const msg = e instanceof Error ? encodeURIComponent(e.message) : 'sync_failed';
    return NextResponse.redirect(new URL(`/dashboard/tickets?sync_error=${msg}`, baseUrl()));
  }
}
