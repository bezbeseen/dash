import type { BoardStatus } from '@prisma/client';
import type { Job } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import {
  inboundLeadKindDetailLabel,
  inboundLeadKindPillClassName,
  inboundLeadKindTitleAttr,
} from '@/lib/domain/lead-ticket';
import {
  compactStoredEmailSubtitle,
  inboundLeadCardDisplayParts,
  jobPrimaryHeading,
  jobSecondaryHeading,
} from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';
import { TicketTitleEditor } from '@/components/ticket-detail/ticket-title-editor';

type Props = {
  jobId: string;
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
  inboundLeadKind?: Job['inboundLeadKind'];
};

export function TicketDetailHeader({
  jobId,
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
  let sub: string | null = null;
  if (inboundLeadKind != null) {
    const parts = inboundLeadCardDisplayParts({
      projectName,
      projectDescription: projectDescription ?? null,
      inboundLeadKind,
    });
    if (parts) {
      sub = parts.synopsis.trim() || null;
    } else {
      sub = jobSecondaryHeading({
        projectName,
        customerName,
        projectDescription: projectDescription ?? undefined,
      });
    }
  } else {
    sub = jobSecondaryHeading({
      projectName,
      customerName,
      projectDescription: projectDescription ?? undefined,
    });
  }
  if (sub) {
    const compactEmail = compactStoredEmailSubtitle(sub);
    if (compactEmail) sub = compactEmail;
  }
  const displayTitle = jobPrimaryHeading({ projectName, customerName });

  return (
    <header className="detail-header">
      <div>
        <TicketTitleEditor jobId={jobId} projectName={projectName} displayTitle={displayTitle} />
        {sub && sub !== displayTitle ? <p className="detail-subtitle">{sub}</p> : null}
      </div>
      <div className="detail-header-badges d-flex flex-column align-items-end gap-2 flex-shrink-0">
        {inboundLeadKind != null ? (
          <span
            className={`badge rounded-pill small fw-semibold border ${inboundLeadKindPillClassName(inboundLeadKind)}`}
            title={inboundLeadKindTitleAttr(inboundLeadKind)}
          >
            {inboundLeadKindDetailLabel(inboundLeadKind)}
          </span>
        ) : null}
        <span className="badge badge-lg text-bg-primary">{boardStatusDisplayLabel(boardStatus)}</span>
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
