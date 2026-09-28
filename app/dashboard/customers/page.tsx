import Link from 'next/link';
import { CustomersList } from '@/components/customers-list';
import { prisma } from '@/lib/db/prisma';
import { rollupCustomersFromJobs } from '@/lib/domain/customers';
import { fmtShortDate, fmtUsd } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';

type CustomersPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function firstQueryString(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const q = firstQueryString((await searchParams).q);
  const jobs = await prisma.job.findMany({
    select: {
      customerName: true,
      quickbooksCustomerId: true,
      archivedAt: true,
      estimateAmountCents: true,
      invoiceAmountCents: true,
      amountPaidCents: true,
      updatedAt: true,
    },
  });
  const rows = rollupCustomersFromJobs(jobs);
  const outstandingTotal = rows.reduce((sum, row) => sum + row.outstandingCents, 0);
  const estimatedTotal = rows.reduce((sum, row) => sum + row.estimatedCents, 0);
  const invoicedTotal = rows.reduce((sum, row) => sum + row.invoicedCents, 0);
  const paidTotal = rows.reduce((sum, row) => sum + row.paidCents, 0);
  const openTotal = rows.reduce((sum, row) => sum + row.openJobCount, 0);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Customers</h1>
          <p className="board-topbar-sub">
            One row per QuickBooks customer (or name when a ticket has no customer id). Estimate, invoice,
            and paid/deposit totals come from jobs already in Dash. The customer page refreshes those
            figures from QuickBooks when a ticket has an estimate or invoice id.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/tickets" className="btn btn-toolbar">
            Tickets
          </Link>
          <Link href="/dashboard/work" className="btn btn-toolbar btn-toolbar-muted">
            Work
          </Link>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4" style={{ minHeight: 0 }}>
        <div className="row g-3 mb-3">
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Customers</p>
              <p className="fs-5 fw-semibold mb-0">{rows.length}</p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Open tickets</p>
              <p className="fs-5 fw-semibold mb-0">{openTotal}</p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Estimate / invoiced</p>
              <p className="fs-5 fw-semibold mb-0">
                {fmtUsd(estimatedTotal)}
                <span className="text-body-secondary fw-normal"> / {fmtUsd(invoicedTotal)}</span>
              </p>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Paid / outstanding</p>
              <p className="fs-5 fw-semibold mb-0">
                {fmtUsd(paidTotal)}
                <span className="text-body-secondary fw-normal"> / {fmtUsd(outstandingTotal)}</span>
              </p>
            </div>
          </div>
        </div>

        <CustomersList
          initialQuery={q}
          rows={rows.map((row) => ({
            key: row.key,
            name: row.name,
            quickbooksCustomerId: row.quickbooksCustomerId,
            openJobCount: row.openJobCount,
            archivedJobCount: row.archivedJobCount,
            estimatedLabel: fmtUsd(row.estimatedCents),
            invoicedLabel: fmtUsd(row.invoicedCents),
            paidLabel: fmtUsd(row.paidCents),
            outstandingCents: row.outstandingCents,
            outstandingLabel: fmtUsd(row.outstandingCents),
            lastUpdatedLabel: fmtShortDate(row.lastUpdatedAt),
          }))}
        />
      </div>
    </div>
  );
}
