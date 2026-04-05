import type { BoardStatus } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';
import { jobPrimaryHeading, jobSecondaryHeading } from '@/lib/domain/job-display';
import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  projectName: string;
  customerName: string;
  boardStatus: BoardStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function TicketDetailHeader({
  projectName,
  customerName,
  boardStatus,
  createdAt,
  updatedAt,
}: Props) {
  const sub = jobSecondaryHeading({ projectName });
  return (
    <header className="detail-header">
      <div>
        <h1 className="detail-title">{jobPrimaryHeading({ projectName, customerName })}</h1>
        {sub ? <p className="meta detail-subtitle">{sub}</p> : null}
        <p className="meta detail-subtitle mb-0">
          Created {fmtDetailDate(createdAt)}
          <span aria-hidden> · </span>
          Updated {fmtDetailDate(updatedAt)}
        </p>
      </div>
      <span className="badge badge-lg">{boardStatusDisplayLabel(boardStatus)}</span>
    </header>
  );
}
