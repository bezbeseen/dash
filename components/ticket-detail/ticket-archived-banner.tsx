import type { ArchiveReason } from '@prisma/client';
import { fmtDetailDate } from '@/lib/ticket/format';

type Props = {
  sectionId?: string;
  jobId: string;
  archivedAt: Date;
  archiveReason: ArchiveReason | null;
};

export function TicketArchivedBanner({ sectionId, jobId, archivedAt, archiveReason }: Props) {
  return (
    <div id={sectionId} className="ticket-archived-banner" role="status">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <strong>Off the board</strong>
          <span className="ticket-archived-reason">
            ({archiveReason === 'LOST' ? 'Lost' : 'Done'} · {fmtDetailDate(archivedAt)})
          </span>
          <span className="meta"> This ticket is hidden from the production board but kept for history.</span>
        </div>
        <form action={`/api/jobs/${jobId}/restore`} method="post" className="flex-shrink-0">
          <button type="submit" className="btn btn-sm btn-outline-primary">
            Restore to board
          </button>
        </form>
      </div>
    </div>
  );
}
