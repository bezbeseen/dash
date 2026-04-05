import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getQuickBooksApiBase, getQuickBooksEnvironment } from '@/lib/quickbooks/config';
import { listRecentEstimates, listRecentInvoices } from '@/lib/quickbooks/client';

/**
 * Dev helper: open in browser to see if Query API returns rows for the connected realm.
 * Disabled in production.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'No QuickBooksToken row — run Connect QuickBooks first.' });
  }

  try {
    const [estimates, invoices] = await Promise.all([
      listRecentEstimates(token.realmId, 20),
      listRecentInvoices(token.realmId, 20),
    ]);

    return NextResponse.json({
      ok: true,
      realmId: token.realmId,
      environment: getQuickBooksEnvironment(),
      apiBase: getQuickBooksApiBase(),
      estimateCount: estimates.length,
      invoiceCount: invoices.length,
      sampleEstimates: estimates.slice(0, 5).map((e) => ({
        id: e.id,
        customerName: e.customerName,
        projectName: e.projectName,
        status: e.status,
      })),
      sampleInvoices: invoices.slice(0, 5).map((i) => ({
        id: i.id,
        customerName: i.customerName,
        totalAmtCents: i.totalAmtCents,
        status: i.status,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        realmId: token.realmId,
        environment: getQuickBooksEnvironment(),
        apiBase: getQuickBooksApiBase(),
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
