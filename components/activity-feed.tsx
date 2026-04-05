import Link from 'next/link';
import type { DashboardRecentAction } from '@/lib/domain/dashboard-summary';
import { fmtDetailDate, labelEnum } from '@/lib/ticket/format';

type Props = {
  actions: DashboardRecentAction[];
  emptyMessage?: string;
};

export function ActivityFeed({ actions, emptyMessage = 'No activity yet.' }: Props) {
  if (actions.length === 0) {
    return <p className="meta small mb-0">{emptyMessage}</p>;
  }

  return (
    <ul className="list-unstyled mb-0 small">
      {actions.map((a) => (
        <li key={a.id} className="border-bottom border-light py-2">
          <div className="d-flex flex-wrap align-items-baseline gap-2 mb-1">
            <span className="text-body-secondary text-nowrap">{fmtDetailDate(a.createdAt)}</span>
            <span className="badge rounded-pill text-bg-light border">{labelEnum(a.source)}</span>
            <span className="text-body-secondary">{a.eventName}</span>
          </div>
          <p className="mb-1">{a.message}</p>
          <Link href={`/dashboard/jobs/${a.jobId}`} className="fw-semibold text-decoration-none">
            {a.ticketTitle}
          </Link>
        </li>
      ))}
    </ul>
  );
}
