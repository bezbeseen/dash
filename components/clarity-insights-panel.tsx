import type { ReactNode } from 'react';
import type { ClarityInsights } from '@/lib/analytics/clarity-api';
import {
  CLARITY_DAILY_REQUEST_LIMIT,
  CLARITY_MAX_LOOKBACK_DAYS,
  getClarityLinks,
  getClarityProjectId,
  type ClarityLinks,
} from '@/lib/analytics/clarity-config';
import type { ClarityInsightsData } from '@/lib/domain/load-clarity-insights';

function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function formatDecimal(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function formatPercent(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Relative so a UTC server and a Pacific reader agree on how stale the snapshot is. */
function formatAge(fetchedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - fetchedAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function ClarityLinkButtons({ links }: { links: ClarityLinks }) {
  return (
    <div className="d-flex flex-wrap gap-2">
      <a href={links.heatmaps} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-toolbar">
        Heatmaps
      </a>
      <a
        href={links.recordings}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-toolbar btn-toolbar-muted"
      >
        Session recordings
      </a>
      <a
        href={links.dashboard}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-toolbar btn-toolbar-muted"
      >
        Clarity dashboard
      </a>
    </div>
  );
}

function SetupSteps({ links, projectId }: { links: ClarityLinks; projectId: string | null }) {
  return (
    <ol className="small text-body-secondary mb-0 ps-3">
      <li className="mb-2">
        In Clarity, open your project →{' '}
        <a href={links.dataExportSettings} target="_blank" rel="noopener noreferrer">
          <strong>Settings → Data Export</strong>
        </a>{' '}
        → <strong>Generate new API token</strong>. Only project admins can do this.
      </li>
      <li className="mb-2">
        Name it 4-32 characters, letters/numbers/<code className="detail-mono">-</code>
        <code className="detail-mono">_</code>
        <code className="detail-mono">.</code> only (no spaces), then copy the token — Clarity shows it once.
      </li>
      <li className="mb-2">
        Paste it into <code className="detail-mono">CLARITY_API_TOKEN</code> (Vercel → Project → Environment
        Variables) and redeploy.
      </li>
      <li>
        {projectId ? (
          <>
            Deep links use <code className="detail-mono">NEXT_PUBLIC_CLARITY_PROJECT_ID</code> (
            <code className="detail-mono">{projectId}</code>), which is already set.
          </>
        ) : (
          <>
            Also set <code className="detail-mono">NEXT_PUBLIC_CLARITY_PROJECT_ID</code> so the buttons above open
            this project instead of the Clarity home page.
          </>
        )}
      </li>
    </ol>
  );
}

function SignalTable({ signals }: { signals: ClarityInsights['signals'] }) {
  return (
    <div className="table-responsive">
      <table className="table table-hover mb-0 align-middle">
        <thead className="table-light">
          <tr>
            <th className="ps-4">Frustration signal</th>
            <th className="text-end" style={{ width: '10rem' }}>
              Sessions affected
            </th>
            <th className="text-end pe-4" style={{ width: '8rem' }}>
              Occurrences
            </th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr key={signal.key}>
              <td className="ps-4">{signal.label}</td>
              <td className="text-end tabular-nums">{formatPercent(signal.sessionPercentage)}</td>
              <td className="text-end pe-4 fw-semibold tabular-nums">{formatInt(signal.occurrences)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function summaryCards(insights: ClarityInsights) {
  const cards: Array<{ key: string; label: string; value: string }> = [
    { key: 'sessions', label: 'Sessions', value: formatInt(insights.traffic.sessions) },
    { key: 'users', label: 'Distinct users', value: formatInt(insights.traffic.distinctUsers) },
    { key: 'pages', label: 'Pages / session', value: formatDecimal(insights.traffic.pagesPerSession) },
    { key: 'bots', label: 'Bot sessions', value: formatInt(insights.traffic.botSessions) },
  ];
  if (insights.averageScrollDepth !== null) {
    cards.push({ key: 'scroll', label: 'Avg. scroll depth', value: formatPercent(insights.averageScrollDepth) });
  }
  if (insights.activeEngagementSeconds !== null) {
    cards.push({ key: 'active', label: 'Active time', value: formatDuration(insights.activeEngagementSeconds) });
  } else if (insights.totalEngagementSeconds !== null) {
    cards.push({ key: 'total', label: 'Engagement time', value: formatDuration(insights.totalEngagementSeconds) });
  }
  return cards;
}

function PanelShell({
  links,
  subtitle,
  children,
}: {
  links: ClarityLinks;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <h2 className="h6 fw-semibold mb-1">Behaviour insights &middot; Microsoft Clarity</h2>
          <p className="small text-body-secondary mb-0">{subtitle}</p>
        </div>
        <ClarityLinkButtons links={links} />
      </div>
      {children}
    </section>
  );
}

export function ClarityInsightsPanel({ data }: { data: ClarityInsightsData }) {
  const links = getClarityLinks();

  if (!data.ok && data.kind === 'not_configured') {
    return (
      <PanelShell
        links={links}
        subtitle="Heatmaps and session recordings are always a click away. Add an API token to also read the numbers here."
      >
        <div className="card border rounded-3 p-4 bg-body">
          <h3 className="h6 fw-semibold mb-2">Connect the Clarity Data Export API</h3>
          <SetupSteps links={links} projectId={getClarityProjectId()} />
        </div>
      </PanelShell>
    );
  }

  if (!data.ok && data.kind === 'quota_exceeded') {
    return (
      <PanelShell links={links} subtitle={`Checked ${formatAge(data.fetchedAt)}.`}>
        <div className="card border rounded-3 p-4 bg-body border-warning border-opacity-50">
          <h3 className="h6 fw-semibold mb-2">Clarity daily quota used up</h3>
          <p className="small text-body-secondary mb-0">
            Clarity allows {CLARITY_DAILY_REQUEST_LIMIT} Data Export requests per project per day and that budget is
            spent. Dash refreshes every 6 hours, so something else on the same project — a preview deployment, a
            script, or a manual call — is also using it. The quota resets on Clarity&apos;s side; the numbers come
            back on their own. Heatmaps and recordings are unaffected.
          </p>
        </div>
      </PanelShell>
    );
  }

  if (!data.ok && data.kind === 'auth_failed') {
    return (
      <PanelShell links={links} subtitle={`Checked ${formatAge(data.fetchedAt)}.`}>
        <div className="card border rounded-3 p-4 bg-body border-danger border-opacity-50">
          <h3 className="h6 fw-semibold mb-2 text-danger">Clarity rejected the API token</h3>
          <p className="small mb-3 font-monospace text-break" style={{ whiteSpace: 'pre-wrap' }}>
            {data.message}
          </p>
          <p className="small text-body-secondary mb-3">
            The token is missing, expired, or belongs to a different project. Generate a fresh one and update{' '}
            <code className="detail-mono">CLARITY_API_TOKEN</code>; Dash retries as soon as the value changes.
          </p>
          <SetupSteps links={links} projectId={getClarityProjectId()} />
        </div>
      </PanelShell>
    );
  }

  if (!data.ok) {
    return (
      <PanelShell links={links} subtitle={`Checked ${formatAge(data.fetchedAt)}.`}>
        <div className="card border rounded-3 p-4 bg-body border-danger border-opacity-50">
          <h3 className="h6 fw-semibold mb-2 text-danger">Could not load Clarity insights</h3>
          <p className="small mb-2 font-monospace text-break" style={{ whiteSpace: 'pre-wrap' }}>
            {data.message}
          </p>
          <p className="small text-body-secondary mb-0">
            Dash will try again in up to 6 hours. Browser-side Clarity tracking is separate and keeps recording.
          </p>
        </div>
      </PanelShell>
    );
  }

  const { insights } = data;
  const subtitle = `Last ${insights.numOfDays} days (UTC) · as of ${formatAge(data.fetchedAt)}`;

  if (insights.traffic.sessions <= 0) {
    return (
      <PanelShell links={links} subtitle={subtitle}>
        <div className="card border rounded-3 p-4 bg-body">
          <h3 className="h6 fw-semibold mb-2">No Clarity sessions yet</h3>
          <p className="small text-body-secondary mb-0">
            Clarity recorded no sessions in the last {insights.numOfDays} days. The API only reaches back{' '}
            {CLARITY_MAX_LOOKBACK_DAYS} days, so a quiet stretch shows as empty even when the project has history.
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell links={links} subtitle={subtitle}>
      <div className="row g-3">
        {summaryCards(insights).map((card) => (
          <div className="col-6 col-lg-4 col-xl-2" key={card.key}>
            <div className="card border rounded-3 h-100 bg-body shadow-sm">
              <div className="card-body">
                <p className="menu-label mb-1">{card.label}</p>
                <p className="h4 fw-semibold mb-0 tabular-nums">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card border rounded-3 overflow-hidden bg-body shadow-sm">
        <div className="card-body border-bottom py-3">
          <h3 className="h6 fw-semibold mb-0">Where visitors struggle</h3>
        </div>
        <SignalTable signals={insights.signals} />
      </div>

      <p className="small text-body-secondary mb-0">
        From the{' '}
        <a
          href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
        >
          Clarity Data Export API
        </a>
        , which only serves the last {CLARITY_MAX_LOOKBACK_DAYS} days and allows{' '}
        {CLARITY_DAILY_REQUEST_LIMIT} requests per day, so Dash caches one snapshot for 6 hours. Open a heatmap or a
        recording in Clarity to see what these numbers mean on the page.
      </p>
    </PanelShell>
  );
}
