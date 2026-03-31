import type { BoardStatus } from '@prisma/client';
import { boardStatusDisplayLabel } from '@/lib/domain/board-display';

type Props = {
  projectName: string;
  customerName: string;
  boardStatus: BoardStatus;
};

export function TicketDetailHeader({ projectName, customerName, boardStatus }: Props) {
  return (
    <header className="detail-header">
      <div>
        <h1 className="detail-title">{projectName}</h1>
        <p className="meta detail-subtitle">{customerName}</p>
      </div>
      <span className="badge badge-lg">{boardStatusDisplayLabel(boardStatus)}</span>
    </header>
  );
}
