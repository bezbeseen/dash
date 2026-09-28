'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

function rowMatchesQuery(
  row: { name: string; quickbooksCustomerId: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  return Boolean(row.quickbooksCustomerId?.toLowerCase().includes(q));
}

export type CustomerListRowView = {
  key: string;
  name: string;
  quickbooksCustomerId: string | null;
  openJobCount: number;
  archivedJobCount: number;
  estimatedLabel: string;
  invoicedLabel: string;
  paidLabel: string;
  outstandingCents: number;
  outstandingLabel: string;
  lastUpdatedLabel: string;
};

export function CustomersList({
  rows,
  initialQuery,
}: {
  rows: CustomerListRowView[];
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const filtered = useMemo(
    () => rows.filter((row) => rowMatchesQuery(row, q)),
    [rows, q],
  );

  return (
    <>
      <form
        className="d-flex flex-wrap gap-2 align-items-center mb-3"
        action="/dashboard/customers"
        method="get"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="visually-hidden" htmlFor="customers-search">
          Search customers
        </label>
        <input
          id="customers-search"
          className="form-control"
          style={{ maxWidth: '22rem' }}
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or QuickBooks ID"
          autoComplete="off"
        />
        {q.trim() ? (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setQ('')}>
            Clear
          </button>
        ) : null}
        <span className="small text-body-secondary">
          {filtered.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? 'customer' : 'customers'}`
            : `${filtered.length} of ${rows.length}`}
        </span>
      </form>

      {filtered.length === 0 ? (
        <p className="text-body-secondary small mb-0">
          {rows.length === 0
            ? 'No customers yet. Sync QuickBooks or add a ticket and they will show up here.'
            : 'No customers match that search.'}
        </p>
      ) : (
        <div className="table-responsive border rounded-2 bg-body">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="ps-3">Customer</th>
                <th className="text-end">Open tickets</th>
                <th className="text-end d-none d-lg-table-cell">Estimate</th>
                <th className="text-end">Invoiced</th>
                <th className="text-end">Paid / deposit</th>
                <th className="text-end">Outstanding</th>
                <th className="text-end pe-3 d-none d-md-table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.key}>
                  <td className="ps-3">
                    <Link
                      href={`/dashboard/customers/${row.key}` as never}
                      className="fw-semibold text-decoration-none"
                    >
                      {row.name}
                    </Link>
                    {row.quickbooksCustomerId ? (
                      <div className="small text-body-secondary">QuickBooks customer</div>
                    ) : (
                      <div className="small text-body-secondary">Name only (no QuickBooks customer yet)</div>
                    )}
                  </td>
                  <td className="text-end text-nowrap">
                    <span className="fw-semibold">{row.openJobCount}</span>
                    {row.archivedJobCount > 0 ? (
                      <span className="small text-body-secondary">
                        {' '}
                        · {row.archivedJobCount} archived
                      </span>
                    ) : null}
                  </td>
                  <td className="text-end text-nowrap detail-mono d-none d-lg-table-cell">
                    {row.estimatedLabel}
                  </td>
                  <td className="text-end text-nowrap detail-mono">{row.invoicedLabel}</td>
                  <td className="text-end text-nowrap detail-mono">{row.paidLabel}</td>
                  <td
                    className={`text-end text-nowrap detail-mono${row.outstandingCents > 0 ? ' fw-semibold' : ' text-body-secondary'}`}
                  >
                    {row.outstandingLabel}
                  </td>
                  <td className="text-end pe-3 small text-body-secondary text-nowrap d-none d-md-table-cell">
                    {row.lastUpdatedLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
