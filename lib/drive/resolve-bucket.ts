import { BoardStatus, ProductionStatus, type Job } from '@prisma/client';

export type DriveBucket = 'ACTIVE' | 'COMPLETED' | 'ARCHIVE';

/**
 * Maps ticket state to a top-level shared-drive folder:
 * - Archive: job is off the board (`archivedAt`).
 * - Completed: work is delivered (paid or not).
 * - Active: everything else, including prepaid tickets that have not been delivered yet.
 */
export function driveBucketForJob(
  job: Pick<Job, 'archivedAt' | 'boardStatus'> & { productionStatus?: ProductionStatus | null },
): DriveBucket {
  if (job.archivedAt != null) return 'ARCHIVE';
  if (job.productionStatus === ProductionStatus.DELIVERED || job.boardStatus === BoardStatus.DELIVERED) {
    return 'COMPLETED';
  }
  return 'ACTIVE';
}
