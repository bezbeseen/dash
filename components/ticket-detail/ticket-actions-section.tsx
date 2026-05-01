import { JobWorkflowActions } from '@/components/job-workflow-actions';

type Props = {
  sectionId?: string;
  jobId: string;
  archived: boolean;
  needsWrapUpReminder: boolean;
  wrapUpRecorded: boolean;
};

export function TicketActionsSection({
  sectionId,
  jobId,
  archived,
  needsWrapUpReminder,
  wrapUpRecorded,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Actions</h2>
      <JobWorkflowActions
        jobId={jobId}
        archived={archived}
        needsWrapUpReminder={needsWrapUpReminder}
        wrapUpRecorded={wrapUpRecorded}
      />
    </section>
  );
}
