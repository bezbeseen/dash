import type { BoardStatus } from '@prisma/client';
import { InboundLeadKind } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { inboundLeadKindShortLabel } from '@/lib/domain/lead-ticket';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  projectName: string;
  projectDescription?: string | null;
  customerName: string;
  boardStatus: BoardStatus;
  createdAt: Date;
  updatedAt: Date;
  /** When set (e.g. marketing lead), meta labels clarify the ticket did not originate in QuickBooks. */
  createdLabel?: string;
  updatedLabel?: string;
  /** Marketing webhook source; shown next to board status when set. */
  inboundLeadKind?: InboundLeadKind | null;
};

export function TicketDetailHeader({
  projectName,
  projectDescription,
  customerName,
  boardStatus,
  createdAt,
  updatedAt,
  createdLabel = 'Created',
  updatedLabel = 'Updated',
  inboundLeadKind = null,
}: Props) {
  const sub = jobSecondaryHeading({ projectName, projectDescription: projectDescription ?? undefined });
  const sourceShort = inboundLeadKindShortLabel(inboundLeadKind);
  const sourceTitle =
    inboundLeadKind === InboundLeadKind.FORM
      ? 'Lead source: form submission webhook'
      : inboundLeadKind === InboundLeadKind.CONVERSATION
        ? 'Lead source: conversation webhook'
        : undefined;
  return (
    <header className="detail-header">
      <div>
        <h1 className="detail-title">{jobPrimaryHeading({ projectName, customerName })}</h1>
        {sub ? <p className="detail-subtitle">{sub}</p> : null}
      </div>
      <div className="detail-header-badges d-flex flex-column align-items-end gap-2 flex-shrink-0">
        {sourceShort ? (
          <span
            className={`badge rounded-pill small fw-semibold border ${
              inboundLeadKind === InboundLeadKind.FORM
                ? 'bg-primary-subtle text-primary-emphasis border-primary-subtle'
                : 'bg-info-subtle text-info-emphasis border-info-subtle'
            }`}
            title={sourceTitle}
          >
            {inboundLeadKind === InboundLeadKind.FORM ? 'Form submission' : 'Conversation'}
          </span>
        ) : null}
        <span className="badge badge-lg">{boardStatusDisplayLabel(boardStatus)}</span>
      </div>

      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-label">{createdLabel}</div>
          <div className="meta-value">{fmtDetailDate(createdAt)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">{updatedLabel}</div>
          <div className="meta-value">{fmtDetailDate(updatedAt)}</div>
        </div>
      </div>
    </header>
  );
}
