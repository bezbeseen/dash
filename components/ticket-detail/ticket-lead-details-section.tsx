import type { Job } from '@prisma/client';
import { ExpandableTicketPre } from '@/components/ticket-detail/expandable-ticket-pre';
import { InboundLeadConversationPanel } from '@/components/inbound-lead-conversation-panel';
import { splitInboundStoredDescription } from '@/lib/domain/job-display';
import { inboundLeadKindDetailLabel, inboundLeadKindPhrase } from '@/lib/domain/lead-ticket';

type TicketLeadDetailsSectionProps = {
  sectionId?: string;
  job: Pick<Job, 'projectDescription' | 'customerName' | 'projectName' | 'inboundLeadKind'>;
};

export function TicketLeadDetailsSection({ sectionId = 'ticket-lead-details', job }: TicketLeadDetailsSectionProps) {
  const body = job.projectDescription?.trim() ?? '';
  if (!body) {
    return null;
  }

  const sourcePhrase = inboundLeadKindPhrase(job.inboundLeadKind);
  const sourceRowLabel = job.inboundLeadKind != null ? inboundLeadKindDetailLabel(job.inboundLeadKind) : null;

  const split = job.inboundLeadKind != null ? splitInboundStoredDescription(body) : null;
  const structuredLeadBody =
    split != null &&
    (Boolean(split.conversationTranscript?.trim()) ||
      split.metaBlocks.length > 0 ||
      Boolean(split.submittedFields?.trim()));

  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">Lead details</h2>
      <p className="ticket-lead-intro">
        This ticket is a <strong>lead</strong> (not from QuickBooks).
        {sourcePhrase ? (
          <>
            {' '}
            It was created from a <strong>{sourcePhrase}</strong>.
          </>
        ) : (
          <>
            {' '}
            The summary below usually came from your marketing webhook or manual entry.
          </>
        )}
      </p>
      <dl className="detail-kv ticket-lead-kv">
        {sourceRowLabel ? (
          <>
            <dt>Source</dt>
            <dd>{sourceRowLabel}</dd>
          </>
        ) : null}
        <dt>Customer</dt>
        <dd>{job.customerName}</dd>
        <dt>Project</dt>
        <dd>{job.projectName}</dd>
        {structuredLeadBody && split ? (
          <>
            <dt>Contact</dt>
            <dd>
              {split.contactSummary.trim() ? (
                <pre className="ticket-lead-body">{split.contactSummary.trim()}</pre>
              ) : (
                <span className="text-body-secondary">—</span>
              )}
            </dd>
            {split.conversationTranscript?.trim() || split.metaBlocks.length > 0 ? (
              <>
                <dt>Conversation / transcript</dt>
                <dd className="mb-0">
                  <InboundLeadConversationPanel
                    transcript={split.conversationTranscript}
                    metaBlocks={split.metaBlocks}
                    defaultOpen
                  />
                </dd>
              </>
            ) : null}
            {split.submittedFields?.trim() ? (
              <>
                <dt>Submitted fields (raw)</dt>
                <dd>
                  <ExpandableTicketPre text={split.submittedFields.trim()} />
                </dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>
      {!structuredLeadBody ? <ExpandableTicketPre text={body} /> : null}
    </section>
  );
}
