import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { fetchInvoicePdf } from '@/lib/quickbooks/client';
import { resolveRealmIdForJob } from '@/lib/quickbooks/realm';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job?.quickbooksInvoiceId) {
    return NextResponse.json({ error: 'No QuickBooks invoice on this ticket.' }, { status: 404 });
  }

  const realm = await resolveRealmIdForJob(job.quickbooksCompanyId);
  if (!realm) {
    return NextResponse.json({ error: 'QuickBooks is not connected (no company / realm).' }, { status: 400 });
  }

  try {
    const pdf = await fetchInvoicePdf(realm, job.quickbooksInvoiceId);
    const safe = (job.quickbooksInvoiceId || 'invoice').replaceAll(/[^\w.-]/g, '_');
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${safe}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not load PDF from QuickBooks.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
