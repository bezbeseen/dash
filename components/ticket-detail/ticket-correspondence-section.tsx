import { fmtDetailDate } from '@/lib/ticket/format';
import {
  type CorrespondenceItem,
  type CorrespondenceSide,
} from '@/lib/ticket/correspondence-thread';

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sideLabel(side: CorrespondenceSide): string {
  if (side === 'shop') return 'Shop';
  if (side === 'customer') return 'Customer';
  return 'Unknown';
}

function channelLabel(channel: CorrespondenceItem['channel']): string {
  return channel === 'yelp' ? 'Yelp' : 'Gmail';
}

type Props = {
  sectionId?: string;
  jobId: string;
  items: CorrespondenceItem[];
  gmailThreadId: string | null;
  gmailMessageTotalCount: number;
  gmailMessagesShownCount: number;
  gmailMessagesUiTruncated: boolean;
};

export function TicketCorrespondenceSection({
  sectionId,
  jobId,
  items,
  gmailThreadId,
  gmailMessageTotalCount,
  gmailMessagesShownCount,
  gmailMessagesUiTruncated,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Correspondence</h2>
      <p className="meta ticket-doc-note">
        Email on this ticket, oldest first. Customer messages sit on the left; shop mail
        (a connected mailbox in From) sits on the right. Yelp notification chrome is trimmed so
        the actual ask or reply is readable. This is read-only — reply in Gmail or Yelp Biz.
      </p>
      {gmailMessagesUiTruncated ? (
        <p className="meta gmail-ui-cap-notice" style={{ marginBottom: 14 }}>
          This thread has <strong>{gmailMessageTotalCount}</strong> Gmail messages in Dash. Only the{' '}
          <strong>latest {gmailMessagesShownCount}</strong> are shown here so the page doesn&apos;t
          overload the browser. Full content stays in the database; open Gmail for the complete
          archive if needed.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="meta correspondence-empty">
          {gmailThreadId
            ? 'A Gmail thread is linked, but there are no messages to read yet. Open Advanced under Gmail on this ticket and sync the thread.'
            : 'No synced mail or Yelp follow-ups on this ticket yet. Open Advanced under Gmail on this ticket to find or paste a thread, or wait for the Yelp lead-email scan to attach one.'}
        </p>
      ) : (
        <ol className="correspondence-thread">
          {items.map((item) => (
            <li key={item.id} className={`correspondence-item is-${item.side}`}>
              <div className="correspondence-item-head">
                <div className="correspondence-item-who">
                  <span className="correspondence-side-badge">{sideLabel(item.side)}</span>
                  <strong>{item.fromLabel}</strong>
                </div>
                <span className="meta">{fmtDetailDate(item.at)}</span>
              </div>
              <div className="correspondence-item-meta meta">
                <span>{channelLabel(item.channel)}</span>
                {item.subject ? <span>{item.subject}</span> : null}
                {item.toAddr ? <span>To: {item.toAddr}</span> : null}
              </div>
              {item.body ? (
                <p className="correspondence-item-body">{item.body}</p>
              ) : (
                <p className="correspondence-item-body meta">No message text stored for this item.</p>
              )}
              {item.trimmedBoilerplate && item.originalBody ? (
                <details className="correspondence-boilerplate">
                  <summary>Yelp notification chrome hidden</summary>
                  <p className="correspondence-item-body correspondence-item-body-original">{item.originalBody}</p>
                </details>
              ) : null}
              {item.attachments.length > 0 ? (
                <ul className="gmail-attachment-list">
                  {item.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/jobs/${jobId}/gmail-files/${a.id}`}
                        className="ticket-mailto"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {a.filename}
                      </a>
                      <span className="meta"> · {fmtSize(a.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
