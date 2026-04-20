import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { upsertJobFromInvoice } from '@/lib/domain/sync';
import { fetchInvoiceByDocNumber } from '@/lib/quickbooks/client';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Import a single invoice from QuickBooks by document number (two API calls: query + GET).
 * Use when full sync hasn’t picked up a new invoice yet; does not replace periodic Sync.
 */
export async function POST(req: Request) {
  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  if (!token) {
    return NextResponse.redirect(new URL('/dashboard/tickets?sync_error=no_tokens', baseUrl()));
  }

  const formData = await req.formData();
  const docRaw = String(formData.get('doc_number') ?? '').trim();
  if (!docRaw) {
    return NextResponse.redirect(
      new URL(`/dashboard/tickets?sync_error=${encodeURIComponent('Enter an invoice number.')}`, baseUrl()),
    );
  }

  try {
    const inv = await fetchInvoiceByDocNumber(token.realmId, docRaw);
    if (!inv) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/tickets?sync_error=${encodeURIComponent('No QuickBooks invoice found with that number.')}`,
          baseUrl(),
        ),
      );
    }
    const job = await upsertJobFromInvoice(inv, { realmId: token.realmId });
    return NextResponse.redirect(new URL(`/dashboard/jobs/${job.id}?qb_imported=1`, baseUrl()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'import_failed';
    return NextResponse.redirect(new URL(`/dashboard/tickets?sync_error=${encodeURIComponent(msg)}`, baseUrl()));
  }
}
