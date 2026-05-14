import { JobWorkflowActions } from '@/components/job-workflow-actions';
import { TicketReviewRequestEmailButton } from '@/components/ticket-review-request-email-button';

type Props = {
  sectionId?: string;
  jobId: string;
  archived: boolean;
  needsWrapUpReminder: boolean;
  wrapUpRecorded: boolean;
  suppressProductionShortcuts?: boolean;
  reviewEmailFeatureEnabled?: boolean;
  reviewEmailMailboxReady?: boolean;
  reviewEmailSentAtIso?: string | null;
};

export function TicketActionsSection({
  sectionId,
  jobId,
  archived,
  needsWrapUpReminder,
  wrapUpRecorded,
  suppressProductionShortcuts = false,
  reviewEmailFeatureEnabled = false,
  reviewEmailMailboxReady = false,
  reviewEmailSentAtIso = null,
}: Props) {
  if (suppressProductionShortcuts) {
    return null;
  }

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Actions</h2>
      <JobWorkflowActions
        jobId={jobId}
        archived={archived}
        needsWrapUpReminder={needsWrapUpReminder}
        wrapUpRecorded={wrapUpRecorded}
      />
      {!archived ? (
        <TicketReviewRequestEmailButton
          jobId={jobId}
          featureEnabled={reviewEmailFeatureEnabled}
          mailboxReady={reviewEmailMailboxReady}
          lastSentAtIso={reviewEmailSentAtIso}
        />
      ) : null}
    </section>
  );
}
