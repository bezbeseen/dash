import type { BoardStatus } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  projectName: string;
  projectDescription?: string | null;
  customerName: string;
  boardStatus: BoardStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function TicketDetailHeader({
  projectName,
  projectDescription,
  customerName,
  boardStatus,
  createdAt,
  updatedAt,
}: Props) {
  const sub = jobSecondaryHeading({ projectName, projectDescription: projectDescription ?? undefined });
  return (
    <header className="detail-header">
      <div>
        <h1 className="detail-title">{jobPrimaryHeading({ projectName, customerName })}</h1>
        {sub ? <p className="detail-subtitle">{sub}</p> : null}
      </div>
      <span className="badge badge-lg">{boardStatusDisplayLabel(boardStatus)}</span>

      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-label">Created</div>
          <div className="meta-value">{fmtDetailDate(createdAt)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Updated</div>
          <div className="meta-value">{fmtDetailDate(updatedAt)}</div>
        </div>
      </div>
    </header>
  );
}
