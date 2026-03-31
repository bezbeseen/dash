import { BoardStatus } from '@prisma/client';

/** Dashboard merges some lanes; DB still uses separate BoardStatus values. */
export type DashboardColumnKey = BoardStatus | 'READY_INVOICED';

export const DASHBOARD_COLUMNS: DashboardColumnKey[] = [
  'QUOTED',
  'APPROVED',
  'PRODUCTION',
  'READY_INVOICED',
  'DELIVERED',
  'PAID',
];

export function boardColumnTitle(column: DashboardColumnKey): string {
  if (column === 'READY_INVOICED') {
    return 'Ready / invoiced';
  }
  if (column === 'DELIVERED') {
    return 'Delivered / installed';
  }
  return column.replaceAll('_', ' ');
}

export function jobMatchesDashboardColumn(job: { boardStatus: BoardStatus }, column: DashboardColumnKey): boolean {
  if (column === 'READY_INVOICED') {
    return job.boardStatus === BoardStatus.READY || job.boardStatus === BoardStatus.INVOICED;
  }
  return job.boardStatus === column;
}

/** Human label for a job’s current board status (badges, ticket header). */
export function boardStatusDisplayLabel(status: BoardStatus): string {
  switch (status) {
    case BoardStatus.REQUESTED:
      return 'Lead';
    case BoardStatus.READY:
      return 'Ready';
    case BoardStatus.INVOICED:
      return 'Invoiced';
    case BoardStatus.DELIVERED:
      return 'Delivered / installed';
    default:
      return status.replaceAll('_', ' ');
  }
}
