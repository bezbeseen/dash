import type { ActivityLog } from '@prisma/client';
import { fmtDetailDate, labelEnum } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  logs: ActivityLog[];
};

export function TicketActivityLogSection({ sectionId, logs }: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Activity</h2>
      {logs.length === 0 ? (
        <p className="meta">No activity logged yet.</p>
      ) : (
        <ul className="activity-list">
          {logs.map((log) => (
            <li key={log.id} className="activity-item">
              <div className="activity-meta">
                <span className="activity-time">{fmtDetailDate(log.createdAt)}</span>
                <span className="badge">{labelEnum(log.source)}</span>
                <span className="activity-event">{log.eventName}</span>
              </div>
              <p className="activity-message">{log.message}</p>
              {log.metadata != null && Object.keys(log.metadata as object).length > 0 ? (
                <pre className="activity-metadata">{JSON.stringify(log.metadata, null, 2)}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
