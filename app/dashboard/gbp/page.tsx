import Link from 'next/link';
import { GbpMetricsDashboard } from '@/components/gbp-metrics-dashboard';
import {
  loadGbpMetricsPageData,
  normalizeGbpLocationIndex,
  normalizeGbpMetricsRange,
} from '@/lib/domain/load-gbp-metrics-page';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GbpMetricsPage({ searchParams }: Props) {
  const q = await searchParams;
  const daysRaw = Array.isArray(q.days) ? q.days[0] : q.days;
  const locRaw = Array.isArray(q.loc) ? q.loc[0] : q.loc;
  const rangeDays = normalizeGbpMetricsRange(daysRaw);
  const locationIndex = normalizeGbpLocationIndex(locRaw);

  const data = await loadGbpMetricsPageData(rangeDays, locationIndex);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Google Business metrics</h1>
          <p className="board-topbar-sub">
            Impressions, calls, website clicks, direction requests, and messages from your connected profile, each
            against the previous period.
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
