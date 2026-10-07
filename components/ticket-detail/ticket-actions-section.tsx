'use client';

import { JobWorkflowActions } from '@/components/job-workflow-actions';
import { PrequoteWorkflowActions } from '@/components/prequote-workflow-actions';
import { TicketReviewRequestEmailButton } from '@/components/ticket-review-request-email-button';
import { TicketProjectBookActions } from '@/components/ticket-detail/ticket-project-book-actions';

type Props = {
  sectionId?: string;
  jobId: string;
  archived: boolean;
  needsWrapUpReminder: boolean;
  wrapUpRecorded: boolean;
  suppressProductionShortcuts?: boolean;
  reviewEmailFeatureEnabled?: boolean;
  reviewEmailMailboxReady?: boolean;
  reviewEmailSentLabel?: string | null;
  hasDriveFolder?: boolean;
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
  reviewEmailSentLabel = null,
  hasDriveFolder = false,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Actions</h2>
      <TicketProjectBookActions jobId={jobId} hasFolder={hasDriveFolder} />
      {suppressProductionShortcuts ? (
        <PrequoteWorkflowActions jobId={jobId} archived={archived} />
      ) : (
        <JobWorkflowActions
          jobId={jobId}
          archived={archived}
          needsWrapUpReminder={needsWrapUpReminder}
          wrapUpRecorded={wrapUpRecorded}
        />
      )}
      {!archived ? (
        <TicketReviewRequestEmailButton
          jobId={jobId}
          featureEnabled={reviewEmailFeatureEnabled}
          mailboxReady={reviewEmailMailboxReady}
          lastSentLabel={reviewEmailSentLabel}
        />
      ) : null}
    </section>
  );
}
