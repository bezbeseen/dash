import { BoardStatus, EstimateStatus, type Job } from '@prisma/client';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';

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

/**
 * When a ticket is still Lead (pre-quote) but already has a QuickBooks estimate link, explain why it is not on the
 * main board **Quoted** column — we only move there when QuickBooks marks the estimate as {@link EstimateStatus.SENT}
 * (see `deriveBoardStatus`).
 */
export function leadTicketQuotedColumnHint(
  job: Pick<Job, 'boardStatus' | 'estimateStatus' | 'quickbooksEstimateId'>,
): string | null {
  if (job.boardStatus !== BoardStatus.REQUESTED) return null;
  const estId = job.quickbooksEstimateId;
  if (!estId || isSyntheticQuickBooksId(estId)) return null;
  if (job.estimateStatus === EstimateStatus.SENT) return null;

  if (job.estimateStatus === EstimateStatus.DRAFT) {
    return 'Estimate is still a draft in QuickBooks. After you send it there, sync — it will move to Quoted on the main Tickets board.';
  }
  if (job.estimateStatus === EstimateStatus.REJECTED) {
    return 'QuickBooks shows this estimate as rejected.';
  }
  if (job.estimateStatus === EstimateStatus.ACCEPTED) {
    return null;
  }
  return 'QuickBooks has not marked this estimate as sent yet (or status is unknown). Sent estimates appear under Quoted on the main board after sync.';
}
