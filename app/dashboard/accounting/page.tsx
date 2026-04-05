import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { computeMoneyRollup } from '@/lib/domain/money-rollup';
import { fmtUsd } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';

export default async function AccountingPage() {
  const rows = await prisma.job.findMany({
    where: { archivedAt: null },
    select: {
      estimateAmountCents: true,
      invoiceAmountCents: true,
      amountPaidCents: true,
    },
  });

  const r = computeMoneyRollup(rows);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Accounting</h1>
          <p className="board-topbar-sub">
            Totals from <strong>{r.ticketCount}</strong> active tickets (nothing archived). Paid and invoice
            lines come from QuickBooks sync.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard/cash" className="btn btn-toolbar">
            Cash &amp; banks
          </Link>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
          <Link href="/dashboard/tickets" className="btn btn-toolbar btn-toolbar-muted">
            Tickets
          </Link>
        </div>
      </header>

      <div
        className="flex-grow-1 overflow-auto px-3 px-md-4 pb-4"
        style={{ minHeight: 0 }}
      >
        <section className="card border rounded-3 p-4 mb-3 bg-body">
          <p className="text-body-secondary small text-uppercase fw-semibold mb-1">
            Collected (paid in)
          </p>
          <p className="display-5 fw-bold text-body mb-2">{fmtUsd(r.totalPaid)}</p>
          <p className="text-body-secondary small mb-0">
            Sum of <code className="detail-mono">amountPaid</code> across tickets. This is the number that grows as
            invoices get paid in QuickBooks and sync runs.
          </p>
        </section>

        <div className="row g-3">
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Invoiced total</p>
              <p className="fs-5 fw-semibold mb-0">{fmtUsd(r.totalInvoiced)}</p>
              <p className="meta mb-0 mt-1 small">Sum of invoice totals on tickets</p>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Outstanding</p>
              <p className="fs-5 fw-semibold mb-0">{fmtUsd(r.outstanding)}</p>
              <p className="meta mb-0 mt-1 small">Open balance per ticket, summed</p>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Estimates (totals)</p>
              <p className="fs-5 fw-semibold mb-0">{fmtUsd(r.totalEstimates)}</p>
              <p className="meta mb-0 mt-1 small">Sum of estimate amounts (pipeline context)</p>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Paid in full</p>
              <p className="fs-5 fw-semibold mb-0">{r.paidInFull}</p>
              <p className="meta mb-0 mt-1 small">Tickets with invoice and paid up to invoice total</p>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-4">
            <div className="card border rounded-3 p-3 h-100 bg-body">
              <p className="text-body-secondary small mb-1">Open balance</p>
              <p className="fs-5 fw-semibold mb-0">{r.withOpenBalance}</p>
              <p className="meta mb-0 mt-1 small">Tickets still owed money on an invoice</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
