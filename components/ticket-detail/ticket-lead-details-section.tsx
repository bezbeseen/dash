import type { Job } from '@prisma/client';
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
      </dl>
      <pre className="ticket-lead-body">{body}</pre>
    </section>
  );
}
