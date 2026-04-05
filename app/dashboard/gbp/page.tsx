import Link from 'next/link';
import { GbpMetricsDashboard } from '@/components/gbp-metrics-dashboard';
import { loadGbpMetricsPageData } from '@/lib/domain/load-gbp-metrics-page';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GbpMetricsPage({ searchParams }: Props) {
  const q = await searchParams;
  const locRaw = q.loc;
  const locStr = Array.isArray(locRaw) ? locRaw[0] : locRaw;
  const parsed = parseInt(locStr ?? '0', 10);
  const locationIndex = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

  const data = await loadGbpMetricsPageData(locationIndex);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Google Business metrics</h1>
          <p className="board-topbar-sub">
            Performance data from your connected profile: impressions, website taps, calls, and direction requests.
          </p>
        </div>
        <div className="board-topbar-actions">
          <Link href="/dashboard" className="btn btn-toolbar btn-toolbar-muted">
            Dashboard
          </Link>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <GbpMetricsDashboard data={data} />
      </div>
    </div>
  );
}
