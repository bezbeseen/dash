import { EstimateStatus, EventSource, InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { BOARD_PAID_SLACK_CENTS, deriveBoardStatus } from '@/lib/domain/derive-board-status';
import { qbDocActivityEvents } from '@/lib/domain/qb-doc-activity';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';
import { fetchEstimateById, fetchInvoiceById } from '@/lib/quickbooks/client';
import type { EstimateSnapshot, InvoiceSnapshot } from '@/lib/quickbooks/types';

export type JobMoneyFields = {
  estimateAmountCents: number;
  invoiceAmountCents: number;
  amountPaidCents: number;
  estimateStatus: EstimateStatus;
  invoiceStatus: InvoiceStatus;
};

export type LiveJobDocs = {
  estimate: EstimateSnapshot | null;
  invoice: InvoiceSnapshot | null;
};

export function usableQboDocId(id: string | null | undefined): id is string {
  const trimmed = id?.trim();
  return Boolean(trimmed) && !isSyntheticQuickBooksId(trimmed);
}

function mapEstimateStatus(value: EstimateSnapshot['status']): EstimateStatus {
  switch (value) {
    case 'DRAFT':
      return EstimateStatus.DRAFT;
    case 'SENT':
      return EstimateStatus.SENT;
    case 'ACCEPTED':
      return EstimateStatus.ACCEPTED;
    case 'REJECTED':
      return EstimateStatus.REJECTED;
    default:
      return EstimateStatus.UNKNOWN;
  }
}

function mapInvoiceStatus(value: InvoiceSnapshot['status']): InvoiceStatus {
  switch (value) {
    case 'DRAFT':
      return InvoiceStatus.DRAFT;
    case 'OPEN':
      return InvoiceStatus.OPEN;
    case 'PAID':
      return InvoiceStatus.PAID;
    case 'VOID':
      return InvoiceStatus.VOID;
    default:
      return InvoiceStatus.NONE;
  }
}

function preferLiveTotal(liveCents: number | undefined, storedCents: number): number {
  if (liveCents == null) return storedCents;
  if (liveCents > 0 || storedCents === 0) return liveCents;
  return storedCents;
}

/** Overlay live QBO estimate/invoice totals onto stored job money. Does not touch board status. */
export function displayJobMoney(stored: JobMoneyFields, live: LiveJobDocs): JobMoneyFields {
  const invoiceTrusted = live.invoice != null && live.invoice.balanceKnown !== false;
  const liveEstimateStatus = live.estimate ? mapEstimateStatus(live.estimate.status) : null;

  return {
    estimateAmountCents: preferLiveTotal(live.estimate?.totalAmtCents, stored.estimateAmountCents),
    estimateStatus:
      liveEstimateStatus && liveEstimateStatus !== EstimateStatus.UNKNOWN
        ? liveEstimateStatus
        : stored.estimateStatus,
    invoiceAmountCents: preferLiveTotal(live.invoice?.totalAmtCents, stored.invoiceAmountCents),
    amountPaidCents: invoiceTrusted ? live.invoice!.amountPaidCents : stored.amountPaidCents,
    invoiceStatus: invoiceTrusted ? mapInvoiceStatus(live.invoice!.status) : stored.invoiceStatus,
  };
}

export function jobMoneyNeedsPersist(stored: JobMoneyFields, next: JobMoneyFields): boolean {
  return (
    stored.estimateAmountCents !== next.estimateAmountCents ||
    stored.invoiceAmountCents !== next.invoiceAmountCents ||
    stored.amountPaidCents !== next.amountPaidCents ||
    stored.estimateStatus !== next.estimateStatus ||
    stored.invoiceStatus !== next.invoiceStatus
  );
}

export async function persistHydratedJobMoney(jobId: string, next: JobMoneyFields): Promise<void> {
  const current = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      estimateStatus: true,
      invoiceStatus: true,
      estimateAmountCents: true,
      invoiceAmountCents: true,
      amountPaidCents: true,
      productionStatus: true,
      boardStatus: true,
      paidAt: true,
      quickbooksEstimateId: true,
      quickbooksInvoiceId: true,
    },
  });
  if (!current) return;

  const stored: JobMoneyFields = {
    estimateAmountCents: current.estimateAmountCents,
    invoiceAmountCents: current.invoiceAmountCents,
    amountPaidCents: current.amountPaidCents,
    estimateStatus: current.estimateStatus,
    invoiceStatus: current.invoiceStatus,
  };

  const nextBoard = deriveBoardStatus({
    estimateStatus: next.estimateStatus,
    productionStatus: current.productionStatus,
    invoiceStatus: next.invoiceStatus,
    amountPaidCents: next.amountPaidCents,
    invoiceAmountCents: next.invoiceAmountCents,
    quickbooksInvoiceId: current.quickbooksInvoiceId,
  });
  const paidInFull =
    next.invoiceStatus === InvoiceStatus.PAID ||
    (next.invoiceAmountCents > 0 &&
      next.amountPaidCents + BOARD_PAID_SLACK_CENTS >= next.invoiceAmountCents);
  const nextPaidAt = paidInFull ? (current.paidAt ?? new Date()) : null;

  const moneyChanged = jobMoneyNeedsPersist(stored, next);
  const boardChanged = current.boardStatus !== nextBoard;
  const paidAtChanged = (current.paidAt == null) !== (nextPaidAt == null);

  if (!moneyChanged && !boardChanged && !paidAtChanged) return;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      estimateAmountCents: next.estimateAmountCents,
      invoiceAmountCents: next.invoiceAmountCents,
      amountPaidCents: next.amountPaidCents,
      estimateStatus: next.estimateStatus,
      invoiceStatus: next.invoiceStatus,
      boardStatus: nextBoard,
      paidAt: nextPaidAt,
    },
  });

  if (!moneyChanged) return;

  const events = qbDocActivityEvents({
    prev: {
      ...stored,
      quickbooksEstimateId: current.quickbooksEstimateId,
      quickbooksInvoiceId: current.quickbooksInvoiceId,
    },
    next: {
      ...next,
      quickbooksEstimateId: current.quickbooksEstimateId,
      quickbooksInvoiceId: current.quickbooksInvoiceId,
    },
  });
  for (const event of events) {
    await prisma.activityLog.create({
      data: {
        jobId,
        source: EventSource.QUICKBOOKS,
        eventName: event.eventName,
        message: event.message,
        metadata: { source: 'live_qbo' },
      },
    });
  }
}

async function mapInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

/**
 * GET Estimate/Invoice by the ids already stored on tickets.
 * Caps how many jobs we hydrate so a busy customer page stays inside the serverless budget.
 */
export async function fetchLiveJobMoney(
  realmId: string,
  jobs: Array<{
    id: string;
    quickbooksEstimateId: string | null;
    quickbooksInvoiceId: string | null;
  }>,
  opts?: { maxJobs?: number },
): Promise<Map<string, LiveJobDocs>> {
  const maxJobs = opts?.maxJobs ?? 16;
  const chosen = jobs
    .filter((j) => usableQboDocId(j.quickbooksEstimateId) || usableQboDocId(j.quickbooksInvoiceId))
    .slice(0, maxJobs);

  const estIds = [
    ...new Set(chosen.map((j) => j.quickbooksEstimateId).filter(usableQboDocId)),
  ];
  const invIds = [
    ...new Set(chosen.map((j) => j.quickbooksInvoiceId).filter(usableQboDocId)),
  ];

  const estMap = new Map<string, EstimateSnapshot>();
  const invMap = new Map<string, InvoiceSnapshot>();

  await Promise.all([
    mapInBatches(estIds, 3, async (id) => {
      try {
        estMap.set(id, await fetchEstimateById(realmId, id));
      } catch {
        /* keep stored amounts */
      }
    }),
    mapInBatches(invIds, 3, async (id) => {
      try {
        invMap.set(id, await fetchInvoiceById(realmId, id));
      } catch {
        /* keep stored amounts */
      }
    }),
  ]);

  const out = new Map<string, LiveJobDocs>();
  for (const job of chosen) {
    out.set(job.id, {
      estimate: job.quickbooksEstimateId ? estMap.get(job.quickbooksEstimateId) ?? null : null,
      invoice: job.quickbooksInvoiceId ? invMap.get(job.quickbooksInvoiceId) ?? null : null,
    });
  }
  return out;
}

export async function persistHydratedJobs(
  jobs: Array<{ id: string } & JobMoneyFields>,
  liveByJobId: Map<string, LiveJobDocs>,
  _storedById?: Map<string, JobMoneyFields>,
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const live = liveByJobId.get(job.id);
      if (!live || (!live.estimate && !live.invoice)) return;
      try {
        await persistHydratedJobMoney(job.id, job);
      } catch {
        /* page still shows live numbers */
      }
    }),
  );
}
