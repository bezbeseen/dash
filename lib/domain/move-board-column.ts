import {
  BoardStatus,
  EstimateStatus,
  InvoiceStatus,
  ProductionStatus,
  type Job,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { DashboardColumnKey } from '@/lib/domain/board-display';

export type MovableDashboardColumn =
  | 'QUOTED'
  | 'APPROVED'
  | 'PRODUCTION'
  | 'READY_INVOICED'
  | 'DELIVERED'
  | 'PAID';
import { deriveBoardStatus } from '@/lib/domain/derive-board-status';
import { updateProductionStatus } from '@/lib/domain/sync';
import { scheduleSyncJobDriveFolder } from '@/lib/drive/sync-job-folder';
import { EventSource } from '@prisma/client';

export type MoveBoardColumnResult =
  | { ok: true; boardStatus: BoardStatus }
  | { ok: false; error: 'archived' | 'blocked' | 'paid' | 'already' };

function jobMatchesTargetColumn(job: Pick<Job, 'boardStatus'>, column: DashboardColumnKey): boolean {
  if (column === 'READY_INVOICED') {
    return job.boardStatus === BoardStatus.READY || job.boardStatus === BoardStatus.INVOICED;
  }
  return job.boardStatus === column;
}

async function setEstimateLane(
  jobId: string,
  estimateStatus: EstimateStatus,
  eventName: string,
  message: string,
): Promise<MoveBoardColumnResult> {
  const current = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (current.archivedAt != null) return { ok: false, error: 'archived' };

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      estimateStatus,
      productionStatus: ProductionStatus.NOT_STARTED,
    },
  });

  const boardStatus = deriveBoardStatus(updated);
  const finalJob = await prisma.job.update({
    where: { id: jobId },
    data: { boardStatus },
  });

  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.APP,
      eventName,
      message,
    },
  });

  scheduleSyncJobDriveFolder(jobId);
  return { ok: true, boardStatus: finalJob.boardStatus };
}

/**
 * Move a ticket to a dashboard column by updating production / estimate fields
 * (board status is always derived).
 */
export async function moveJobToDashboardColumn(
  jobId: string,
  column: MovableDashboardColumn,
): Promise<MoveBoardColumnResult> {
  const current = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (current.archivedAt != null) return { ok: false, error: 'archived' };
  if (jobMatchesTargetColumn(current, column)) return { ok: false, error: 'already' };

  if (column === 'PAID') {
    const wouldBePaid = deriveBoardStatus(current) === BoardStatus.PAID;
    if (!wouldBePaid) return { ok: false, error: 'paid' };
    return { ok: true, boardStatus: BoardStatus.PAID };
  }

  try {
    switch (column) {
      case 'QUOTED':
        return await setEstimateLane(
          jobId,
          EstimateStatus.SENT,
          'job.board_move',
          'Moved to Quoted on the board.',
        );
      case 'APPROVED':
        return await setEstimateLane(
          jobId,
          EstimateStatus.ACCEPTED,
          'job.board_move',
          'Moved to Approved on the board.',
        );
      case 'PRODUCTION': {
        const finalJob = await updateProductionStatus(
          jobId,
          ProductionStatus.IN_PROGRESS,
          'job.board_move',
          'Moved to Production on the board.',
        );
        return { ok: true, boardStatus: finalJob.boardStatus };
      }
      case 'READY_INVOICED': {
        const hasOpenInvoice =
          current.invoiceStatus === InvoiceStatus.OPEN ||
          current.invoiceStatus === InvoiceStatus.DRAFT ||
          (Boolean(current.quickbooksInvoiceId) && current.invoiceStatus === InvoiceStatus.NONE);

        if (
          hasOpenInvoice &&
          current.productionStatus === ProductionStatus.NOT_STARTED &&
          current.estimateStatus !== EstimateStatus.ACCEPTED &&
          current.estimateStatus !== EstimateStatus.SENT
        ) {
          const updated = await prisma.job.update({
            where: { id: jobId },
            data: {
              invoiceStatus:
                current.invoiceStatus === InvoiceStatus.NONE ? InvoiceStatus.OPEN : current.invoiceStatus,
            },
          });
          const boardStatus = deriveBoardStatus(updated);
          const finalJob = await prisma.job.update({
            where: { id: jobId },
            data: { boardStatus },
          });
          await prisma.activityLog.create({
            data: {
              jobId,
              source: EventSource.APP,
              eventName: 'job.board_move',
              message: 'Moved to Ready / invoiced on the board.',
            },
          });
          scheduleSyncJobDriveFolder(jobId);
          return { ok: true, boardStatus: finalJob.boardStatus };
        }

        const finalJob = await updateProductionStatus(
          jobId,
          ProductionStatus.READY,
          'job.board_move',
          'Moved to Ready / invoiced on the board.',
        );
        return { ok: true, boardStatus: finalJob.boardStatus };
      }
      case 'DELIVERED': {
        const finalJob = await updateProductionStatus(
          jobId,
          ProductionStatus.DELIVERED,
          'job.board_move',
          'Moved to Delivered / installed on the board.',
        );
        return { ok: true, boardStatus: finalJob.boardStatus };
      }
    }
  } catch {
    return { ok: false, error: 'blocked' };
  }
}
