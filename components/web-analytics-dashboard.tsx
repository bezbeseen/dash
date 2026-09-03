import Link from 'next/link';
import type { Ga4NamedCount, Ga4Totals } from '@/lib/analytics/ga4-api';
import {
  WEB_ANALYTICS_RANGE_OPTIONS,
  type WebAnalyticsPageData,
} from '@/lib/domain/load-web-analytics-page';

function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return <span className="small text-body-secondary">no prior data</span>;
  }
  const change = (current - previous) / previous;
  const up = change >= 0;
  const flat = Math.abs(change) < 0.005;
  return (
    <span className={`small fw-semibold ${flat ? 'text-body-secondary' : up ? 'text-success' : 'text-danger'}`}>
      {flat ? '±0%' : `${up ? '+' : ''}${(change * 100).toFixed(1)}%`}
    </span>
  );
}

function SetupSteps({ serviceAccountEmail }: { serviceAccountEmail: string | null }) {
  return (
    <ol className="small text-body-secondary mb-0 ps-3">
      <li className="mb-2">
        In Google Cloud, enable the{' '}
        <a
          href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Analytics Data API
        </a>{' '}
        on the project that will own the service account (any project works).
      </li>
      <li className="mb-2">
        Create a <strong>service account</strong>, add a <strong>JSON key</strong>, and paste the whole file into{' '}
        <code className="detail-mono">GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON</code> (base64 of the file also works).
      </li>
      <li className="mb-2">
        In GA4 → <strong>Admin → Property access management</strong>, add{' '}
        {serviceAccountEmail ? (
          <code className="detail-mono text-break">{serviceAccountEmail}</code>
        ) : (
          'that service account email'
        )}{' '}
        as a <strong>Viewer</strong>.
      </li>
      <li>
        Set <code className="detail-mono">GA4_PROPERTY_ID</code> to the numeric property ID from GA4 → Admin →{' '}
        <strong>Property settings</strong> (not the <code className="detail-mono">G-XXXXXXXX</code> measurement ID).
      </li>
    </ol>
  );
}

function BreakdownCard({
  title,
  rows,
  valueLabel,
}: {
  title: string;
  rows: Ga4NamedCount[];
  valueLabel: string;
}) {
  return (
    <div className="card border rounded-3 overflow-hidden bg-body shadow-sm">
      <div className="card-body border-bottom py-3">
        <h2 className="h6 fw-semibold mb-0">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="card-body">
          <p className="small text-body-secondary mb-0">No data in this range.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="ps-4">{title === 'Top pages' ? 'Page' : 'Source'}</th>
                <th className="text-end pe-4" style={{ width: '8rem' }}>
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="ps-4 text-break">{row.name}</td>
                  <td className="text-end pe-4 fw-semibold tabular-nums">{formatInt(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function summaryCards(totals: Ga4Totals, previous: Ga4Totals) {
  return [
    { key: 'activeUsers', label: 'Users', value: formatInt(totals.activeUsers), current: totals.activeUsers, previous: previous.activeUsers },
    { key: 'newUsers', label: 'New users', value: formatInt(totals.newUsers), current: totals.newUsers, previous: previous.newUsers },
    { key: 'sessions', label: 'Sessions', value: formatInt(totals.sessions), current: totals.sessions, previous: previous.sessions },
    { key: 'views', label: 'Page views', value: formatInt(totals.screenPageViews), current: totals.screenPageViews, previous: previous.screenPageViews },
    {
      key: 'duration',
      label: 'Avg. session',
      value: formatDuration(totals.averageSessionDuration),
      current: totals.averageSessionDuration,
      previous: previous.averageSessionDuration,
    },
    {
      key: 'bounce',
      label: 'Bounce rate',
      value: formatPercent(totals.bounceRate),
      current: totals.bounceRate,
      previous: previous.bounceRate,
    },
  ];
}

export function WebAnalyticsDashboard({ data }: { data: WebAnalyticsPageData }) {
  if (!data.ok && data.kind === 'not_configured') {
    return (
      <div className="card border rounded-3 p-4 bg-body">
        <h2 className="h6 fw-semibold mb-2">Connect Google Analytics</h2>
        <p className="small text-body-secondary mb-3">
          Dash reads GA4 with a service account, so there is no OAuth consent screen and nothing to reconnect later.
        </p>
        <SetupSteps serviceAccountEmail={data.serviceAccountEmail} />
        <div className="mt-3">
          <Link href="/dashboard/settings" className="btn btn-toolbar">
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  if (!data.ok && data.kind === 'error') {
    const permissionIssue = /PERMISSION_DENIED|403|does not have sufficient permissions/i.test(data.message);
    return (
      <div className="card border rounded-3 p-4 bg-body border-danger border-opacity-50">
        <h2 className="h6 fw-semibold mb-2 text-danger">Could not load analytics</h2>
        <p className="small mb-3 font-monospace text-break" style={{ whiteSpace: 'pre-wrap' }}>
          {data.message}
        </p>
        {permissionIssue ? (
          <p className="small text-body-secondary mb-0">
            The service account exists but has no access to the property. In GA4 → <strong>Admin → Property access
            management</strong>, add{' '}
            {data.serviceAccountEmail ? (
              <code className="detail-mono text-break">{data.serviceAccountEmail}</code>
            ) : (
              'the service account email'
            )}{' '}
            as a <strong>Viewer</strong>, then reload.
          </p>
        ) : (
          <SetupSteps serviceAccountEmail={data.serviceAccountEmail} />
        )}
      </div>
    );
  }

  if (!data.ok) return null;

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <p className="small text-body-secondary mb-0">
          GA4 property <span className="detail-mono">{data.propertyId}</span> &middot; last{' '}
          <strong>{data.rangeDays}</strong> days vs previous {data.rangeDays}
        </p>
        <div className="d-flex flex-wrap gap-2">
          {WEB_ANALYTICS_RANGE_OPTIONS.map((days) => (
            <Link
              key={days}
              href={`/dashboard/analytics?days=${days}`}
              className={`btn btn-sm ${days === data.rangeDays ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              {days}d
            </Link>
          ))}
        </div>
      </div>

      <div className="row g-3">
        {summaryCards(data.totals, data.previousTotals).map((card) => (
          <div className="col-6 col-lg-4 col-xl-2" key={card.key}>
            <div className="card border rounded-3 h-100 bg-body shadow-sm">
              <div className="card-body">
                <p className="menu-label mb-1">{card.label}</p>
                <p className="h4 fw-semibold mb-1 tabular-nums">{card.value}</p>
                <DeltaBadge current={card.current} previous={card.previous} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <BreakdownCard title="Top pages" rows={data.topPages} valueLabel="Views" />
        </div>
        <div className="col-12 col-xl-6">
          <div className="d-flex flex-column gap-3">
            <BreakdownCard title="Channels" rows={data.channels} valueLabel="Sessions" />
            <BreakdownCard title="Devices" rows={data.devices} valueLabel="Sessions" />
          </div>
        </div>
      </div>

      <p className="small text-body-secondary mb-0">
        Data from the{' '}
        <a
          href="https://developers.google.com/analytics/devguides/reporting/data/v1"
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
        >
          Google Analytics Data API
        </a>
        . Bounce rate and average session duration are GA4 definitions, so they will not match Universal Analytics
        history.
      </p>
    </div>
  );
}
