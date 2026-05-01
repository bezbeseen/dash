import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';
import { listRecentEstimates, listRecentInvoices } from '@/lib/quickbooks/client';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Same-origin path only; used to return to ticket view (or stay on Tickets). */
function safeDashboardReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;
  if (!trimmed.startsWith('/dashboard/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://') || trimmed.includes('..')) return null;
  const pathname = trimmed.split('?')[0] ?? '';
  return pathname.length > 0 ? pathname : null;
}

/**
 * Syncs recent Estimates + Invoices from QuickBooks into local jobs.
 * Requires a successful Connect QuickBooks (QuickBooksToken row).
 */
export async function POST(req: Request) {
  let returnPath = '/dashboard/tickets';
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    try {
      const form = await req.formData();
      const next = safeDashboardReturnPath(form.get('return_to'));
      if (next) returnPath = next;
    } catch {
      /* ignore malformed body */
    }
  }

  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, realmId: true },
  });
  if (!token) {
    const u = new URL(returnPath, baseUrl());
    u.searchParams.set('sync_error', 'no_tokens');
    return NextResponse.redirect(u);
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

    const u = new URL(returnPath, baseUrl());
    u.searchParams.set('synced', '1');
    u.searchParams.set('e', String(estimates.length));
    u.searchParams.set('i', String(invoices.length));
    if (estimates.length === 0 && invoices.length === 0) {
      u.searchParams.set('sync_warn', 'empty');
    }
    return NextResponse.redirect(u);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'sync_failed';
    const u = new URL(returnPath, baseUrl());
    u.searchParams.set('sync_error', msg);
    return NextResponse.redirect(u);
  }
}
