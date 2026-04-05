import Link from 'next/link';
import {
  groupBankAccountsBySubtype,
  type QbCashPageData,
} from '@/lib/domain/qb-cash-page';
import { getQuickBooksEnvironment } from '@/lib/quickbooks/config';
import { fmtUsd } from '@/lib/ticket/format';

function pctOfTotal(part: number, total: number): string {
  if (total === 0) return '0';
  return ((100 * part) / total).toFixed(1);
}

export function QbCashDashboard({ data }: { data: QbCashPageData }) {
  const env = getQuickBooksEnvironment();

  if (data.kind === 'disconnected') {
    return (
      <div className="row g-4">
        <div className="col-12 col-xl-8">
          <div className="card border rounded-3 bg-body shadow-sm">
            <div className="card-body p-4 p-lg-5">
              <h2 className="h5 fw-semibold mb-3">Connect QuickBooks first</h2>
              <p className="text-body-secondary mb-4">
                Cash &amp; bank balances are read live from your company&apos;s Chart of Accounts in QuickBooks
                Online. Connect from Settings, then return here.
              </p>
              <Link href="/dashboard/settings" className="btn btn-primary">
                Open Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data.kind === 'error') {
    return (
      <div className="alert alert-warning border rounded-3 mb-0" role="status">
        <p className="fw-semibold mb-2">Could not load bank accounts</p>
        <p className="small mb-3">
          The QuickBooks API did not return account data. Try again after syncing tickets, or reconnect QuickBooks in
          Settings if your session expired.
        </p>
        <Link href="/dashboard/settings" className="btn btn-sm btn-outline-dark">
          Settings
        </Link>
      </div>
    );
  }

  const { accounts, realmId } = data;
  const totalCents = accounts.reduce((s, a) => s + a.balanceCents, 0);
  const negativeCount = accounts.filter((a) => a.balanceCents < 0).length;
  const groups = groupBankAccountsBySubtype(accounts);
  const largest = accounts[0];

  return (
    <div className="qb-cash-page d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span
          className={`badge rounded-pill ${env === 'sandbox' ? 'text-bg-warning' : 'text-bg-secondary'}`}
        >
          QuickBooks {env === 'sandbox' ? 'Sandbox' : 'Production'}
        </span>
        <span className="text-body-secondary small font-monospace">Realm {realmId}</span>
      </div>

      <section className="qb-balance-widget qb-cash-hero-card" aria-labelledby="qb-cash-hero-title">
        <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-lg-between gap-3">
          <div>
            <h2 id="qb-cash-hero-title" className="qb-balance-widget-title mb-2">
              Cash in QuickBooks (all bank accounts)
            </h2>
            <div className="qb-balance-hero qb-cash-hero-amount">{fmtUsd(totalCents)}</div>
            <p className="qb-balance-widget-sub mb-0">
              {accounts.length} account{accounts.length === 1 ? '' : 's'} on the Chart of Accounts &middot; sum of
              current balances as QuickBooks stores them
            </p>
          </div>
          <div className="d-flex flex-column gap-2 text-lg-end">
            <Link href="/dashboard/settings" className="btn btn-sm btn-outline-primary align-self-lg-end">
              QuickBooks settings
            </Link>
            <form action="/api/jobs/sync" method="post" className="align-self-lg-end">
              <button type="submit" className="btn btn-sm btn-outline-secondary">
                Sync tickets from QBO
              </button>
            </form>
          </div>
        </div>
      </section>

      <div className="row g-3">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <p className="text-body-secondary small text-uppercase fw-semibold mb-1">Accounts</p>
              <p className="fs-4 fw-bold mb-0">{accounts.length}</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <p className="text-body-secondary small text-uppercase fw-semibold mb-1">Largest balance</p>
              <p className="fs-6 fw-bold mb-0 text-truncate" title={largest?.name}>
                {largest ? fmtUsd(largest.balanceCents) : '\u2014'}
              </p>
              {largest ? <p className="meta small mb-0 mt-1 text-truncate">{largest.name}</p> : null}
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <p className="text-body-secondary small text-uppercase fw-semibold mb-1">Subtypes</p>
              <p className="fs-4 fw-bold mb-0">{groups.length}</p>
              <p className="meta small mb-0 mt-1">Checking, savings, etc.</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border rounded-3 h-100 bg-body shadow-sm">
            <div className="card-body">
              <p className="text-body-secondary small text-uppercase fw-semibold mb-1">Negative balances</p>
              <p className={`fs-4 fw-bold mb-0 ${negativeCount > 0 ? 'text-danger' : ''}`}>{negativeCount}</p>
              <p className="meta small mb-0 mt-1">Credit cards often live under Credit Card, not here</p>
            </div>
          </div>
        </div>
      </div>

      <section className="card border rounded-3 bg-body shadow-sm overflow-hidden">
        <div className="card-header bg-body border-bottom py-3">
          <h3 className="h6 fw-semibold mb-0 d-flex align-items-center gap-2">
            <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
              account_balance
            </i>
            Full register list
          </h3>
          <p className="text-body-secondary small mb-0 mt-2">
            Sorted by balance (high to low). Percent column is share of the total on this page.
          </p>
        </div>
        {accounts.length === 0 ? (
          <div className="card-body">
            <p className="text-body-secondary mb-0">No bank-type accounts returned for this company.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Subtype</th>
                  <th scope="col" className="text-end">
                    Balance
                  </th>
                  <th scope="col" className="text-end">
                    % of total
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="fw-medium">{a.name}</span>
                      <div className="small text-body-secondary font-monospace">Id {a.id}</div>
                    </td>
                    <td className="text-body-secondary small">{a.accountSubType || '\u2014'}</td>
                    <td className={`text-end fw-semibold ${a.balanceCents < 0 ? 'text-danger' : ''}`}>
                      {fmtUsd(a.balanceCents)}
                    </td>
                    <td className="text-end text-body-secondary small">
                      {pctOfTotal(a.balanceCents, totalCents)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="table-light">
                <tr>
                  <th scope="row" colSpan={2} className="text-end">
                    Total
                  </th>
                  <td className="text-end fw-bold">{fmtUsd(totalCents)}</td>
                  <td className="text-end">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="row g-3">
        {groups.map((g) => (
          <div key={g.subtypeLabel} className="col-12 col-lg-6">
            <div className="card border rounded-3 h-100 bg-body shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-3">
                  <h3 className="h6 fw-semibold mb-0">{g.subtypeLabel}</h3>
                  <span className="fw-bold">{fmtUsd(g.subtotalCents)}</span>
                </div>
                <ul className="list-unstyled small mb-0">
                  {g.accounts.map((a) => (
                    <li key={a.id} className="d-flex justify-content-between gap-2 py-1 border-top border-light">
                      <span className="text-truncate">{a.name}</span>
                      <span className={`flex-shrink-0 fw-semibold ${a.balanceCents < 0 ? 'text-danger' : ''}`}>
                        {fmtUsd(a.balanceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="card border rounded-3 bg-body shadow-sm">
        <div className="card-body p-4">
          <h3 className="h6 fw-semibold mb-3">What you are looking at</h3>
          <ul className="text-body-secondary small mb-0 ps-3">
            <li className="mb-2">
              These rows are <strong>Chart of Accounts</strong> entries whose type is <strong>Bank</strong> in
              QuickBooks Online. That usually includes checking and savings; credit cards and loans use other account
              types and do not appear here.
            </li>
            <li className="mb-2">
              <strong>Balance</strong> is the current register balance QuickBooks holds for each account; not
              necessarily the same as your bank&apos;s live website unless you use banking feeds and QBO is caught up.
            </li>
            <li className="mb-2">
              Dash <strong>tickets</strong> (estimates, invoices, paid amounts) are a different slice of data. They
              sync from QBO into the board; this page is intentionally about <strong>cash-on-books</strong>, not
              per-ticket AR.
            </li>
            <li>
              For ticket-level money, use <Link href="/dashboard/accounting">Accounting</Link>; for connecting QBO and
              running sync, use <Link href="/dashboard/settings">Settings</Link>.
            </li>
          </ul>
        </div>
      </section>

      <section className="card border rounded-3 border-dashed bg-body-secondary bg-opacity-25">
        <div className="card-body p-4">
          <h3 className="h6 fw-semibold mb-3 d-flex align-items-center gap-2">
            <i className="material-icons-outlined text-body-secondary" style={{ fontSize: 22 }}>
              construction
            </i>
            Room to grow
          </h3>
          <p className="text-body-secondary small mb-3">
            QuickBooks exposes more than we surface here yet. Natural next steps if you want this page to go deeper:
          </p>
          <ul className="text-body-secondary small mb-0 ps-3">
            <li className="mb-2">
              Register / recent transactions per bank account (query General Ledger or activity endpoints).
            </li>
            <li className="mb-2">Credit card balances (separate AccountType query) alongside bank cash.</li>
            <li className="mb-2">Unpaid bills and AP aging vs cash (requires Bill / Vendor models).</li>
            <li className="mb-2">
              Cash-flow window (inflows/outflows over a date range) aligned with your statement cycle.
            </li>
            <li>Alerts when total cash crosses thresholds you care about.</li>
          </ul>
        </div>
      </section>

      <p className="text-body-tertiary small mb-0">
        Data loaded on each request from QuickBooks; not a stored snapshot in Dash. Balances from Chart of Accounts;
        not real-time bank feeds unless QBO is synced with your bank. Accounts whose names include{' '}
        <strong>Chase</strong>, <strong>Bank of America</strong>, or <strong>BofA</strong> are omitted from this page.
      </p>
    </div>
  );
}
