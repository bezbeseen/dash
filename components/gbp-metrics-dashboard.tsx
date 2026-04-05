import Link from 'next/link';
import type { GbpMetricsPageData } from '@/lib/domain/load-gbp-metrics-page';

export function GbpMetricsDashboard({ data }: { data: GbpMetricsPageData }) {
  if (!data.ok && data.kind === 'no_connection') {
    return (
      <div className="card border rounded-3 p-4 bg-body">
        <h2 className="h6 fw-semibold mb-2">Connect Google Business Profile</h2>
        <p className="small text-body-secondary mb-3">
          OAuth is required to read performance metrics (calls, website clicks, impressions, directions).
        </p>
        <Link href="/dashboard/settings" className="btn btn-toolbar">
          Open Settings
        </Link>
      </div>
    );
  }

  if (!data.ok && data.kind === 'error') {
    const rateLimited = /429|RATE_LIMIT|Quota exceeded|RESOURCE_EXHAUSTED/i.test(data.message);
    return (
      <div className="card border rounded-3 p-4 bg-body border-danger border-opacity-50">
        <h2 className="h6 fw-semibold mb-2 text-danger">Could not load metrics</h2>
        <p className="small mb-3 font-monospace text-break" style={{ whiteSpace: 'pre-wrap' }}>
          {data.message}
        </p>
        {rateLimited ? (
          <p className="small text-body-secondary mb-3">
            Google is rate-limiting <strong>My Business Account Management</strong> for your Cloud project. Wait a few
            minutes, avoid hammering refresh, then try again. In{' '}
            <a
              href="https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas"
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-none"
            >
              APIs &amp; Services &rarr; Quotas
            </a>
            , check <strong>Requests per minute</strong>; if quota shows <strong>0</strong>, link{' '}
            <strong>Billing</strong> to the project or request a quota increase. Dash now caches location listing for 5
            minutes to reduce repeat calls.
          </p>
        ) : (
          <p className="small text-body-secondary mb-3">
            Enable <strong>Business Profile Performance API</strong> in the same Google Cloud project as your OAuth
            client:{' '}
            <a
              href="https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-none"
            >
              enable in API Library
            </a>
            . Account Management and Business Information must stay enabled for location listing.
          </p>
        )}
        <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
          Settings
        </Link>
      </div>
    );
  }

  if (!data.ok) return null;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <p className="small text-body-secondary mb-0">
          Signed in as <span className="detail-mono">{data.googleEmail}</span> &middot; last{' '}
          <strong>{data.rangeDays}</strong> days (UTC)
        </p>
        <a
          href="https://business.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-outline-secondary"
        >
          Open Google Business
        </a>
      </div>

      {data.allLocations.length > 1 ? (
        <div className="card border rounded-3 p-3 bg-body">
          <p className="menu-label mb-2">Location</p>
          <div className="d-flex flex-wrap gap-2">
            {data.allLocations.map((loc, i) => (
              <Link
                key={loc.name}
                href={`/dashboard/gbp?loc=${i}`}
                className={`btn btn-sm ${i === data.selectedIndex ? 'btn-primary' : 'btn-outline-secondary'}`}
              >
                {loc.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card border rounded-3 overflow-hidden bg-body shadow-sm">
        <div className="card-body border-bottom py-3">
          <h2 className="h6 fw-semibold mb-0">{data.location.title}</h2>
          <p className="small text-body-secondary mb-0 mt-1 font-monospace text-break">{data.location.name}</p>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="ps-4">Metric</th>
                <th className="text-end pe-4" style={{ width: '8rem' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.metric}>
                  <td className="ps-4">{row.label}</td>
                  <td className="text-end pe-4 fw-semibold tabular-nums">{formatInt(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="small text-body-secondary mb-0">
        Data from Google&apos;s{' '}
        <a
          href="https://developers.google.com/my-business/reference/performance/rest"
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
        >
          Business Profile Performance API
        </a>
        . Totals are sums of daily values in the range; zeros may be omitted by Google on some days.
      </p>
    </div>
  );
}

function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}
