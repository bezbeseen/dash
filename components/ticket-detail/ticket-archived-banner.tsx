import type { ArchiveReason } from '@prisma/client';
import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  archivedAt: Date;
  archiveReason: ArchiveReason | null;
};

export function TicketArchivedBanner({ sectionId, archivedAt, archiveReason }: Props) {
  return (
    <div id={sectionId} className="ticket-archived-banner" role="status">
      <strong>Off the board</strong>
      <span className="ticket-archived-reason">
        ({archiveReason === 'LOST' ? 'Lost' : 'Done'} · {fmtDetailDate(archivedAt)})
      </span>
      <span className="meta"> This ticket is hidden from the production board but kept for history.</span>
    </div>
  );
}
