import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  jobId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function TicketDetailFooter({ sectionId, jobId, createdAt, updatedAt }: Props) {
  return (
    <footer id={sectionId} className="detail-footer meta ticket-detail-panel ticket-detail-footer">
      <span>
        Job ID: <code className="detail-mono">{jobId}</code>
      </span>
      <span>
        Created {fmtDetailDate(createdAt)} · Updated {fmtDetailDate(updatedAt)}
      </span>
    </footer>
  );
}
