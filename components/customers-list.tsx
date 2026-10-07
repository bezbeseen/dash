'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SortableTh, type SortDir } from '@/components/sortable-th';

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
  estimatedCents: number;
  estimatedLabel: string;
  invoicedCents: number;
  invoicedLabel: string;
  paidCents: number;
  paidLabel: string;
  outstandingCents: number;
  outstandingLabel: string;
  lastUpdatedAt: string;
  lastUpdatedLabel: string;
};

type SortKey = 'name' | 'open' | 'estimate' | 'invoiced' | 'paid' | 'outstanding' | 'updated';

function defaultDir(key: SortKey): SortDir {
  return key === 'name' ? 'asc' : 'desc';
}

function compareRows(a: CustomerListRowView, b: CustomerListRowView, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case 'name':
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      break;
    case 'open':
      cmp = a.openJobCount - b.openJobCount;
      break;
    case 'estimate':
      cmp = a.estimatedCents - b.estimatedCents;
      break;
    case 'invoiced':
      cmp = a.invoicedCents - b.invoicedCents;
      break;
    case 'paid':
      cmp = a.paidCents - b.paidCents;
      break;
    case 'outstanding':
      cmp = a.outstandingCents - b.outstandingCents;
      break;
    case 'updated':
      cmp = Date.parse(a.lastUpdatedAt) - Date.parse(b.lastUpdatedAt);
      break;
    default: {
      const _n: never = key;
      return _n;
    }
  }
  if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

export function CustomersList({
  rows,
  initialQuery,
}: {
  rows: CustomerListRowView[];
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [sortKey, setSortKey] = useState<SortKey>('outstanding');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const filtered = useMemo(() => {
    const matched = rows.filter((row) => rowMatchesQuery(row, q));
    return [...matched].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, q, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  }

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
            ? 'No customers with an estimate or invoice yet. Sync QuickBooks and they will show up here.'
            : 'No customers match that search.'}
        </p>
      ) : (
        <div className="table-responsive border rounded-2 bg-body">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <SortableTh label="Customer" column="name" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} className="ps-3" />
                <SortableTh label="Open tickets" column="open" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" />
                <SortableTh label="Estimate" column="estimate" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" className="d-none d-lg-table-cell" />
                <SortableTh label="Invoiced" column="invoiced" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" />
                <SortableTh label="Paid / deposit" column="paid" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" />
                <SortableTh label="Outstanding" column="outstanding" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" />
                <SortableTh label="Updated" column="updated" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} align="end" className="pe-3 d-none d-md-table-cell" />
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
                        · {row.archivedJobCount} history
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
