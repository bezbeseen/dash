import { JobCardActions } from '@/components/job-card-actions';

type Props = {
  sectionId?: string;
  jobId: string;
  archived: boolean;
};

export function TicketActionsSection({ sectionId, jobId, archived }: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Actions</h2>
      <JobCardActions jobId={jobId} archived={archived} />
    </section>
  );
}
