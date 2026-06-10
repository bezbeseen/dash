'use client';

import { JobWorkflowActions } from '@/components/job-workflow-actions';
import { PrequoteWorkflowActions } from '@/components/prequote-workflow-actions';
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
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Actions</h2>
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
          lastSentAtIso={reviewEmailSentAtIso}
        />
      ) : null}
    </section>
  );
}
