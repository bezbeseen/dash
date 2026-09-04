import { fmtDetailDate } from '@/lib/ticket/format';
import {
  type CorrespondenceItem,
  type CorrespondenceSide,
} from '@/lib/ticket/correspondence-thread';
import { YELP_LEADS_DENIED_MESSAGE } from '@/lib/yelp/lead-ids';

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
  canRefreshYelp?: boolean;
  yelpRefreshDenied?: boolean;
  yelpRefreshError?: string | null;
  yelpRefreshedOk?: boolean;
  yelpRefreshedInserted?: number | null;
};

export function TicketCorrespondenceSection({
  sectionId,
  jobId,
  items,
  gmailThreadId,
  gmailMessageTotalCount,
  gmailMessagesShownCount,
  gmailMessagesUiTruncated,
  canRefreshYelp = false,
  yelpRefreshDenied = false,
  yelpRefreshError = null,
  yelpRefreshedOk = false,
  yelpRefreshedInserted = null,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Correspondence</h2>
      <p className="meta ticket-doc-note">
        Email and Yelp Biz messages on this ticket, oldest first. Customer messages sit on the left;
        shop messages (a connected mailbox in From, or a Yelp Biz shop reply) sit on the right. Yelp
        notification chrome is trimmed so the actual ask or reply is readable. This is read-only —
        reply in Gmail or Yelp Biz.
      </p>
      {canRefreshYelp ? (
        <form className="correspondence-yelp-refresh" action={`/api/jobs/${jobId}/yelp-conversation-sync`} method="post">
          <button type="submit" className="btn btn-toolbar">
            Refresh Yelp conversation
          </button>
          <p className="meta" style={{ margin: '8px 0 0' }}>
            Pulls the Yelp Biz thread (shop + customer) via the Leads API. Shop replies that never
            reached Gmail show up here. Does not mark the lead as replied.
          </p>
        </form>
      ) : null}
      {yelpRefreshDenied ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          {YELP_LEADS_DENIED_MESSAGE}
        </p>
      ) : null}
      {yelpRefreshError ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          {yelpRefreshError}
        </p>
      ) : null}
      {yelpRefreshedOk ? (
        <p className="board-toast board-toast-ok" style={{ marginBottom: 12 }}>
          {yelpRefreshedInserted != null && yelpRefreshedInserted > 0
            ? `Yelp Biz conversation updated (${yelpRefreshedInserted} new message${yelpRefreshedInserted === 1 ? '' : 's'}).`
            : 'Yelp Biz conversation is up to date.'}
        </p>
      ) : null}
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
            : canRefreshYelp
              ? 'No synced mail or Yelp Biz messages on this ticket yet. Click Refresh Yelp conversation, or open Advanced under Gmail to find a thread.'
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
