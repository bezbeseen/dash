type Props = {
  sectionId?: string;
  jobId: string;
};

export function TicketDetailFooter({ sectionId, jobId }: Props) {
  return (
    <footer id={sectionId} className="detail-footer meta ticket-detail-panel ticket-detail-footer">
      <span>
        Job ID: <code className="detail-mono">{jobId}</code>
      </span>
    </footer>
  );
}
