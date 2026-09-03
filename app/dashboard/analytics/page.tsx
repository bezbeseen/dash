import Link from 'next/link';
import { WebAnalyticsDashboard } from '@/components/web-analytics-dashboard';
import {
  loadWebAnalyticsPageData,
  normalizeWebAnalyticsRange,
} from '@/lib/domain/load-web-analytics-page';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WebAnalyticsPage({ searchParams }: Props) {
  const q = await searchParams;
  const daysRaw = Array.isArray(q.days) ? q.days[0] : q.days;
  const rangeDays = normalizeWebAnalyticsRange(daysRaw);

  const data = await loadWebAnalyticsPageData(rangeDays);

  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Web analytics</h1>
          <p className="board-topbar-sub">
            Google Analytics 4 traffic for the marketing site: users, sessions, top pages, and where visitors came
            from.
          </p>
        </div>
        <div className="board-topbar-actions">
          <a
            href="https://analytics.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-toolbar btn-toolbar-muted"
          >
            Open GA4
          </a>
          <Link href="/dashboard/settings" className="btn btn-toolbar btn-toolbar-muted">
            Settings
          </Link>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <WebAnalyticsDashboard data={data} />
      </div>
    </div>
  );
}
