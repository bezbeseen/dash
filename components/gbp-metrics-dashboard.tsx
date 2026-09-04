import Link from 'next/link';
import type { ReactNode } from 'react';
import { BreakdownCard, formatMetricInt, MetricCard, type NamedCount } from '@/components/metrics-ui';
import {
  GBP_METRICS_RANGE_OPTIONS,
  type GbpMetricsPageData,
} from '@/lib/domain/load-gbp-metrics-page';
import type { GbpFailureReason } from '@/lib/google-business/api-errors';
import {
  GBP_IMPRESSION_METRICS,
  GBP_METRIC_LABELS,
  GBP_REPORTING_LAG_DAYS,
  type GbpMetricTotals,
} from '@/lib/google-business/performance-api';

const PERFORMANCE_API_LIBRARY =
  'https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com';
const PERFORMANCE_API_QUOTAS =
  'https://console.cloud.google.com/apis/api/businessprofileperformance.googleapis.com/quotas';
const GBP_ACCESS_FORM = 'https://support.google.com/business/contact/api_default';

function gbpHref(days: number, loc: number): `/dashboard/gbp?${string}` {
  const params = new URLSearchParams({ days: String(days) });
  if (loc > 0) params.set('loc', String(loc));
  return `/dashboard/gbp?${params.toString()}`;
}

function impressionsTotal(totals: GbpMetricTotals): number {
  return GBP_IMPRESSION_METRICS.reduce((sum, metric) => sum + totals[metric], 0);
}

function SetupSteps() {
  return (
    <ol className="small text-body-secondary mb-0 ps-3">
      <li className="mb-2">
        In Google Cloud, on the <strong>same project as your OAuth client</strong>, enable the{' '}
        <a href={PERFORMANCE_API_LIBRARY} target="_blank" rel="noopener noreferrer">
          Business Profile Performance API
        </a>
        . Keep <strong>My Business Account Management</strong> and <strong>Business Information</strong> enabled too —
        they resolve the location id.
      </li>
      <li className="mb-2">
        Enabling is not enough. Open{' '}
        <a href={PERFORMANCE_API_QUOTAS} target="_blank" rel="noopener noreferrer">
          APIs &amp; Services &rarr; Quotas
        </a>{' '}
        and check <strong>requests per minute</strong>. <strong>0</strong> means Google has not approved the project
        yet; <strong>300</strong> means it has.
      </li>
      <li className="mb-2">
        If the quota is <strong>0</strong>, submit the{' '}
        <a href={GBP_ACCESS_FORM} target="_blank" rel="noopener noreferrer">
          Business Profile API access form
        </a>{' '}
        and pick <strong>Application for Basic API Access</strong>. Use your Cloud <strong>project number</strong> and
        an email that is an owner or manager on the profile. Approval is reviewed by hand.
      </li>
      <li>
        Then use <strong>Connect Google Business Profile</strong> in Settings. Dash needs no extra env vars — it
        resolves the account and location from the connection.
      </li>
    </ol>
  );
}

function StateCard({
  title,
  children,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`card border rounded-3 p-4 bg-body${danger ? ' border-danger border-opacity-50' : ''}`}>
      <h2 className={`h6 fw-semibold mb-2${danger ? ' text-danger' : ''}`}>{title}</h2>
      {children}
    </div>
  );
}

function ErrorGuidance({ failure, requestUrl }: { failure: GbpFailureReason; requestUrl: string | null }) {
  if (failure === 'endpoint' || failure === 'not_found' || failure === 'bad_request') {
    return (
      <div className="small text-body-secondary mb-3">
        <p className="mb-2">
          This is a <strong>request problem, not an approval problem</strong>. Google answered with an error page
          rather than an API response, which means the URL Dash built did not match a Business Profile endpoint.
          Enabling APIs or submitting the access form will not change it.
        </p>
        {requestUrl ? (
          <p className="mb-2">
            Attempted: <code className="detail-mono text-break">{requestUrl}</code>
          </p>
        ) : null}
        <p className="mb-0">
          Check <code className="detail-mono">googleBusinessProfile.accessProbe</code> in{' '}
          <a href="/api/integrations/env-check" target="_blank" rel="noopener noreferrer">
            /api/integrations/env-check
          </a>{' '}
          for the resolved account and location names, the exact URL attempted, and whether Google replied with JSON
          or HTML.
        </p>
      </div>
    );
  }
  if (failure === 'quota') {
    return (
      <p className="small text-body-secondary mb-3">
        Google is rate-limiting or has not granted quota for this Cloud project. Check{' '}
        <a href={PERFORMANCE_API_QUOTAS} target="_blank" rel="noopener noreferrer">
          APIs &amp; Services &rarr; Quotas
        </a>
        : <strong>0</strong> requests per minute means the project still needs approval through the{' '}
        <a href={GBP_ACCESS_FORM} target="_blank" rel="noopener noreferrer">
          Business Profile API access form
        </a>
        . If quota is already 300, wait a few minutes and reload rather than retrying in a loop.
      </p>
    );
  }
  if (failure === 'api_disabled') {
    return (
      <p className="small text-body-secondary mb-3">
        The <strong>Business Profile Performance API</strong> is not enabled on the project behind your OAuth client.{' '}
        <a href={PERFORMANCE_API_LIBRARY} target="_blank" rel="noopener noreferrer">
          Enable it in the API Library
        </a>
        , then reload. Newly enabled APIs can take a couple of minutes to start serving.
      </p>
    );
  }
  if (failure === 'permission') {
    return (
      <p className="small text-body-secondary mb-3">
        The connected Google account can authenticate but is not allowed to read this profile&apos;s performance data.
        Confirm it is an <strong>owner or manager</strong> on the Business Profile, then reconnect from Settings.
      </p>
    );
  }
  return (
    <div className="small text-body-secondary mb-3">
      <p className="mb-2">
        Dash could not place this failure. The full setup checklist is below in case the connection was never
        finished, but check the error text above first.
      </p>
      <SetupSteps />
    </div>
  );
}

function actionCards(totals: GbpMetricTotals, previous: GbpMetricTotals) {
  return [
    {
      key: 'impressions',
      label: 'Impressions',
      current: impressionsTotal(totals),
      previous: impressionsTotal(previous),
    },
    { key: 'CALL_CLICKS', label: 'Calls', current: totals.CALL_CLICKS, previous: previous.CALL_CLICKS },
    {
      key: 'WEBSITE_CLICKS',
      label: 'Website clicks',
      current: totals.WEBSITE_CLICKS,
      previous: previous.WEBSITE_CLICKS,
    },
    {
      key: 'BUSINESS_DIRECTION_REQUESTS',
      label: 'Directions',
      current: totals.BUSINESS_DIRECTION_REQUESTS,
      previous: previous.BUSINESS_DIRECTION_REQUESTS,
    },
    {
      key: 'BUSINESS_CONVERSATIONS',
      label: 'Messages',
      current: totals.BUSINESS_CONVERSATIONS,
      previous: previous.BUSINESS_CONVERSATIONS,
    },
    {
      key: 'BUSINESS_BOOKINGS',
      label: 'Bookings',
      current: totals.BUSINESS_BOOKINGS,
      previous: previous.BUSINESS_BOOKINGS,
    },
  ];
}

export function GbpMetricsDashboard({ data }: { data: GbpMetricsPageData }) {
  if (!data.ok && data.kind === 'not_connected') {
    return (
      <StateCard title="Connect Google Business Profile">
        <p className="small text-body-secondary mb-3">
          Dash reads impressions, calls, website clicks, and direction requests with the OAuth connection you make in
          Settings. Nothing is stored client-side.
        </p>
        <SetupSteps />
        <div className="mt-3">
          <Link href="/dashboard/settings" className="btn btn-toolbar">
            Open Settings
          </Link>
        </div>
      </StateCard>
    );
  }

  if (!data.ok && data.kind === 'insufficient_scope') {
    return (
      <StateCard title="Reconnect Google Business Profile" danger>
        <p className="small text-body-secondary mb-3">
          The stored token for <code className="detail-mono text-break">{data.googleEmail}</code> was granted before
          Dash asked for the performance scope, so Google refuses the metrics call. Reconnect Google Business Profile in
          Settings to grant{' '}
          <code className="detail-mono text-break">https://www.googleapis.com/auth/business.manage</code>, then reload
          this page.
        </p>
        <Link href="/dashboard/settings" className="btn btn-toolbar">
          Reconnect in Settings
        </Link>
      </StateCard>
    );
  }

  if (!data.ok && data.kind === 'no_locations') {
    return (
      <StateCard title={data.accountCount === 0 ? 'No Business Profile accounts' : 'No locations found'}>
        <p className="small text-body-secondary mb-3">
          {data.accountCount === 0 ? (
            <>
              Google reports no Business Profile accounts for{' '}
              <code className="detail-mono text-break">{data.googleEmail}</code>. That login has no Business Profile
              access, so reconnect with the Google account that manages the Be Seen listing.
            </>
          ) : (
            <>
              Google returned {data.accountCount} account{data.accountCount === 1 ? '' : 's'} for{' '}
              <code className="detail-mono text-break">{data.googleEmail}</code> but no locations in{' '}
              {data.accountCount === 1 ? 'it' : 'the first one'}. Confirm that account manages the Be Seen listing,
              or reconnect with the Google login that owns it.
            </>
          )}
        </p>
        <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
          Settings
        </Link>
      </StateCard>
    );
  }

  if (!data.ok && data.kind === 'error') {
    return (
      <StateCard title="Could not load metrics" danger>
        <p className="small mb-3 font-monospace text-break" style={{ whiteSpace: 'pre-wrap' }}>
          {data.message}
        </p>
        <ErrorGuidance failure={data.failure} requestUrl={data.requestUrl} />
        <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
          Settings
        </Link>
      </StateCard>
    );
  }

  if (!data.ok) return null;

  const totalImpressions = impressionsTotal(data.totals);
  const keywordRows: NamedCount[] = data.searchKeywords.map((k) => ({ name: k.keyword, count: k.count }));
  const anyThreshold = data.searchKeywords.some((k) => k.belowThreshold);

  return (
    <div className="d-flex flex-column gap-4">
      {data.locationsFromStaleSnapshot ? (
        <div className="alert alert-warning small mb-0" role="status">
          Location list is from a saved snapshot because Google Account Management is rate limited or unavailable.
          Metrics below can still be current, since the Performance API has its own quota.
        </div>
      ) : null}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <p className="small text-body-secondary mb-0">
          <strong>{data.location.title}</strong> &middot; {data.rangeLabel} vs previous {data.rangeDays} days &middot;
          signed in as <span className="detail-mono">{data.googleEmail}</span>
        </p>
        <div className="d-flex flex-wrap gap-2">
          {GBP_METRICS_RANGE_OPTIONS.map((days) => (
            <Link
              key={days}
              href={gbpHref(days, data.selectedIndex)}
              className={`btn btn-sm ${days === data.rangeDays ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              {days}d
            </Link>
          ))}
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-secondary"
          >
            Open GBP
          </a>
        </div>
      </div>

      {data.allLocations.length > 1 ? (
        <div className="card border rounded-3 p-3 bg-body">
          <p className="menu-label mb-2">Location</p>
          <div className="d-flex flex-wrap gap-2">
            {data.allLocations.map((loc, i) => (
              <Link
                key={loc.name}
                href={gbpHref(data.rangeDays, i)}
                className={`btn btn-sm ${i === data.selectedIndex ? 'btn-primary' : 'btn-outline-secondary'}`}
              >
                {loc.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {data.hasAnyData ? null : (
        <div className="alert alert-secondary small mb-0" role="status">
          Google returned no activity for {data.rangeLabel}. A brand-new listing, a suspended profile, or a very quiet
          week all look like this. Performance data also lags {GBP_REPORTING_LAG_DAYS} days, so try a longer range
          before assuming something is broken.
        </div>
      )}

      <div className="row g-3">
        {actionCards(data.totals, data.previousTotals).map((card) => (
          <div className="col-6 col-lg-4 col-xl-2" key={card.key}>
            <MetricCard
              label={card.label}
              value={formatMetricInt(card.current)}
              current={card.current}
              previous={card.previous}
            />
          </div>
        ))}
      </div>

      <div>
        <h2 className="h6 fw-semibold mb-3">Impressions by surface</h2>
        <div className="row g-3">
          {GBP_IMPRESSION_METRICS.map((metric) => (
            <div className="col-6 col-xl-3" key={metric}>
              <MetricCard
                label={GBP_METRIC_LABELS[metric]}
                value={formatMetricInt(data.totals[metric])}
                current={data.totals[metric]}
                previous={data.previousTotals[metric]}
                hint={
                  totalImpressions > 0
                    ? `${((data.totals[metric] / totalImpressions) * 100).toFixed(0)}% of impressions`
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <BreakdownCard
          title="Top search terms"
          rows={keywordRows}
          nameLabel="Search term"
          valueLabel="Searchers"
          emptyText={
            data.searchKeywordsUnavailable
              ? 'Google did not return search terms for this listing. The endpoint needs the same project approval as the rest of the Performance API.'
              : `Google published no search terms for ${data.searchKeywordsMonths}. Keyword data is released only for whole calendar months and lands later than the daily numbers above, so the newest complete month can still be empty.`
          }
        />
        {keywordRows.length > 0 ? (
          <p className="small text-body-secondary mb-0 mt-2">
            Covers {data.searchKeywordsMonths}. Search terms are published per whole calendar month, so this ignores
            the {data.rangeDays}-day selector.
            {data.searchKeywordsUsedFallbackMonth
              ? ' Google had not published the newest complete month yet, so this steps back one further.'
              : ''}
            {anyThreshold
              ? ' Rare terms are reported only as an upper bound, so some counts are a ceiling, not an exact number.'
              : ''}
          </p>
        ) : null}
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
        . The four surfaces sum to the impressions total, but each counts a person once per day, so someone who used
        both Search and Maps is counted on both. Ranges end{' '}
        {GBP_REPORTING_LAG_DAYS} days back because Google finalises daily numbers late; comparing to the previous period
        stays honest that way.
      </p>
    </div>
  );
}
