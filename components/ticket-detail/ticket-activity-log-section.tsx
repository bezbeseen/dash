import type { ActivityLog } from '@prisma/client';
import { qbEventDateLabelFromMetadata } from '@/lib/domain/activity-metadata';
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
          {logs.map((log) => {
            const qbWhen = qbEventDateLabelFromMetadata(log.metadata);
            return (
              <li key={log.id} className="activity-item">
                <div className="activity-meta">
                  <span className="activity-time">
                    {qbWhen ? (
                      <>
                        <span className="fw-semibold">QuickBooks: {qbWhen}</span>
                        <span className="text-body-secondary small ms-1">
                          - Logged {fmtDetailDate(log.createdAt)}
                        </span>
                      </>
                    ) : (
                      fmtDetailDate(log.createdAt)
                    )}
                  </span>
                  <span className="badge">{labelEnum(log.source)}</span>
                  <span className="activity-event">{log.eventName}</span>
                </div>
                <p className="activity-message">{log.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
