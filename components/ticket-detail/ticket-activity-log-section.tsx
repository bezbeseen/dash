import type { ActivityLog } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { qbEventDateLabelFromMetadata } from '@/lib/domain/activity-metadata';
import { fmtDetailDate, labelEnum } from '@/lib/ticket/format';

function activityMetadataPayloadExpanded(meta: Prisma.JsonValue | null): string | null {
  if (meta === null || meta === undefined) return null;
  if (typeof meta === 'string' && meta.trim().length > 0) return meta.trim();
  if (typeof meta === 'number' || typeof meta === 'boolean') return String(meta);
  if (Array.isArray(meta)) {
    if (meta.length === 0) return null;
  } else if (typeof meta === 'object' && Object.keys(meta).length === 0) {
    return null;
  }
  try {
    const s = JSON.stringify(meta, null, 2);
    if (s.length > 48_000) return `${s.slice(0, 48_000)}\n… (truncated)`;
    return s;
  } catch {
    return String(meta);
  }
}

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
            const payloadText = activityMetadataPayloadExpanded(log.metadata);
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
                {payloadText ? (
                  <details className="activity-metadata-details">
                    <summary className="activity-metadata-summary">Raw payload</summary>
                    <pre className="activity-metadata-pre">{payloadText}</pre>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
