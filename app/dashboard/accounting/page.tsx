import Link from 'next/link';
import { AccountingPnlRefreshButton } from '@/components/accounting-pnl-refresh';
import { prisma } from '@/lib/db/prisma';
import { computeMoneyRollup } from '@/lib/domain/money-rollup';
import {
  loadProfitAndLossForDateRange,
  monthToDateRangeYmd,
  normalizePnlDateRange,
  quickBooksReportTimeZone,
  rollingLastDaysRangeYmd,
} from '@/lib/quickbooks/profit-loss';
import { fmtUsd } from '@/lib/ticket/format';

export const dynamic = 'force-dynamic';

type AccountingPageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function AccountingPage({ searchParams }: AccountingPageProps) {
  const q = await searchParams;
  const tz = quickBooksReportTimeZone();
  const defaultRange = rollingLastDaysRangeYmd(30, new Date(), tz);
  const { start: pnlStart, end: pnlEnd } = normalizePnlDateRange(q.from, q.to, {
    start: defaultRange.start,
    end: defaultRange.end,
  });
  const mtd = monthToDateRangeYmd(new Date(), tz);
  const mtdQuery = `/dashboard/accounting?from=${encodeURIComponent(mtd.start)}&to=${encodeURIComponent(mtd.end)}`;

  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { realmId: true },
  });
  const pnl = token ? await loadProfitAndLossForDateRange(token.realmId, pnlStart, pnlEnd) : null;

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
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
            <div>
              <h2 className="h6 fw-semibold mb-1">Profit &amp; Loss</h2>
              <p className="text-body-secondary small mb-0">
                Pulled live from QuickBooks for the date range you set below. Dates are calendar days in{' '}
                <code className="detail-mono">{pnl?.ok ? pnl.reportTimeZone : tz}</code>{' '}
                (<code className="detail-mono">QUICKBOOKS_REPORT_TIMEZONE</code>). Default is the{' '}
                <strong>last 30 days</strong> through today in that zone. Accrual vs cash follows{' '}
                <code className="detail-mono">QUICKBOOKS_PNL_ACCOUNTING_METHOD</code>.
              </p>
            </div>
            <AccountingPnlRefreshButton />
          </div>

          <form
            method="get"
            action="/dashboard/accounting"
            className="row row-cols-auto g-2 align-items-end mb-3"
          >
            <div className="col-12 col-sm-auto">
              <label className="form-label small mb-0" htmlFor="accounting-pnl-from">
                From
              </label>
              <input
                id="accounting-pnl-from"
                className="form-control form-control-sm"
                type="date"
                name="from"
                defaultValue={pnlStart}
                required
              />
            </div>
            <div className="col-12 col-sm-auto">
              <label className="form-label small mb-0" htmlFor="accounting-pnl-to">
                To
              </label>
              <input
                id="accounting-pnl-to"
                className="form-control form-control-sm"
                type="date"
                name="to"
                defaultValue={pnlEnd}
                required
              />
            </div>
            <div className="col-12 col-sm-auto d-flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-sm">
                Apply
              </button>
              <Link href="/dashboard/accounting" className="btn btn-outline-secondary btn-sm">
                Last 30 days
              </Link>
              <Link href={mtdQuery as never} className="btn btn-outline-secondary btn-sm">
                Month to date
              </Link>
            </div>
          </form>
          {!token ? (
            <p className="text-body-secondary small mb-0">
              <Link href="/dashboard/settings">Connect QuickBooks</Link> to load P&amp;L.
            </p>
          ) : !pnl || !pnl.ok ? (
            <div className="alert alert-warning mb-0 py-2 small" role="status">
              Could not load P&amp;L from QuickBooks.
              {pnl && !pnl.ok ? ` ${pnl.error}` : null}
            </div>
          ) : pnl.lines.length === 0 ? (
            <p className="text-body-secondary small mb-0">No rows returned for this period (new company or no data).</p>
          ) : (
            <>
              <p className="small text-body-secondary mb-2">
                {pnl.companyName ? <span className="fw-semibold text-body">{pnl.companyName}</span> : null}
                {pnl.companyName ? ' \u00b7 ' : null}
                {pnl.startPeriod} {'\u2192'} {pnl.endPeriod} {'\u00b7'} {pnl.accountingMethod}
              </p>
              {pnl.netIncomeCents != null ? (
                <p className="fs-5 fw-semibold mb-3">
                  Net income (report){' '}
                  <span className={pnl.netIncomeCents < 0 ? 'text-danger' : 'text-body'}>
                    {fmtUsd(pnl.netIncomeCents)}
                  </span>
                </p>
              ) : null}
              <div className="table-responsive border rounded-2" style={{ maxHeight: 'min(70vh, 32rem)' }}>
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="ps-3">Account / summary</th>
                      <th className="text-end pe-3" style={{ width: '8rem' }}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.lines.map((line, i) => (
                      <tr key={`${line.label}-${i}`}>
                        <td className="ps-3">
                          <span style={{ paddingLeft: line.depth * 12 }}>{line.label}</span>
                        </td>
                        <td className="text-end pe-3 text-nowrap detail-mono">{fmtUsd(line.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

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
