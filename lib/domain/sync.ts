import {
  ArchiveReason,
  BoardStatus,
  EstimateStatus,
  EventSource,
  InvoiceStatus,
  Job,
  ProductionStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { deriveBoardStatus } from '@/lib/domain/derive-board-status';
import { EstimateSnapshot, InvoiceSnapshot } from '@/lib/quickbooks/types';

function mapEstimateStatus(value: EstimateSnapshot['status']): EstimateStatus {
  switch (value) {
    case 'DRAFT': return EstimateStatus.DRAFT;
    case 'SENT': return EstimateStatus.SENT;
    case 'ACCEPTED': return EstimateStatus.ACCEPTED;
    case 'REJECTED': return EstimateStatus.REJECTED;
    default: return EstimateStatus.UNKNOWN;
  }
}

function mapInvoiceStatus(value: InvoiceSnapshot['status']): InvoiceStatus {
  switch (value) {
    case 'DRAFT': return InvoiceStatus.DRAFT;
    case 'OPEN': return InvoiceStatus.OPEN;
    case 'PAID': return InvoiceStatus.PAID;
    case 'VOID': return InvoiceStatus.VOID;
    default: return InvoiceStatus.NONE;
  }
}

export async function upsertJobFromEstimate(
  snapshot: EstimateSnapshot,
  opts?: { realmId?: string },
) {
  const estimateStatus = mapEstimateStatus(snapshot.status);
  const realmId = opts?.realmId;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.job.findUnique({ where: { quickbooksEstimateId: snapshot.id } });
    const wasArchived = existing?.archivedAt != null;
    const updatePayload: Prisma.JobUncheckedUpdateInput = {
      quickbooksEstimateId: snapshot.id,
      quickbooksCustomerId: snapshot.customerId,
      customerName: snapshot.customerName,
      projectName: snapshot.projectName,
      estimateStatus,
      estimateAmountCents: snapshot.totalAmtCents,
      estimateSentAt: snapshot.txnDate ? new Date(snapshot.txnDate) : undefined,
      estimateAcceptedAt: snapshot.acceptedAt ? new Date(snapshot.acceptedAt) : estimateStatus === EstimateStatus.ACCEPTED ? new Date() : undefined,
      ...(realmId ? { quickbooksCompanyId: realmId } : {}),
    };

    const job = existing
      ? await tx.job.update({
          where: { id: existing.id },
          data: updatePayload,
        })
      : await tx.job.create({
          data: {
            quickbooksEstimateId: snapshot.id,
            quickbooksCustomerId: snapshot.customerId,
            customerName: snapshot.customerName,
            projectName: snapshot.projectName,
            estimateStatus,
            estimateAmountCents: snapshot.totalAmtCents,
            estimateSentAt: snapshot.txnDate ? new Date(snapshot.txnDate) : undefined,
            estimateAcceptedAt: snapshot.acceptedAt
              ? new Date(snapshot.acceptedAt)
              : estimateStatus === EstimateStatus.ACCEPTED
                ? new Date()
                : undefined,
            quickbooksCompanyId: realmId ?? undefined,
            productionStatus: ProductionStatus.NOT_STARTED,
            invoiceStatus: InvoiceStatus.NONE,
            boardStatus: BoardStatus.REQUESTED,
          },
        });

    const boardStatus = wasArchived ? job.boardStatus : deriveBoardStatus(job);
    const updated = await tx.job.update({ where: { id: job.id }, data: { boardStatus } });

    await tx.activityLog.create({
      data: {
        jobId: updated.id,
        source: EventSource.QUICKBOOKS,
        eventName: `estimate.${snapshot.status.toLowerCase()}`,
        message: `Estimate ${snapshot.id} synced from QuickBooks.`,
        metadata: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

export async function upsertJobFromInvoice(
  snapshot: InvoiceSnapshot,
  opts?: { realmId?: string },
) {
  const realmId = opts?.realmId;

  return prisma.$transaction(async (tx) => {
    const byInvoice = await tx.job.findUnique({ where: { quickbooksInvoiceId: snapshot.id } });
    const byEstimate = snapshot.linkedEstimateId
      ? await tx.job.findUnique({ where: { quickbooksEstimateId: snapshot.linkedEstimateId } })
      : null;

    const target = byInvoice ?? byEstimate;
    const wasArchived = target?.archivedAt != null;

    const updatePayload: Prisma.JobUncheckedUpdateInput = {
      quickbooksInvoiceId: snapshot.id,
      quickbooksCustomerId: snapshot.customerId,
      customerName: snapshot.customerName,
      projectName: target?.projectName ?? `Invoice #${snapshot.docNumber ?? snapshot.id}`,
      invoiceStatus: mapInvoiceStatus(snapshot.status),
      invoiceAmountCents: snapshot.totalAmtCents,
      amountPaidCents: snapshot.amountPaidCents,
      paidAt: snapshot.status === 'PAID' ? new Date() : null,
      quickbooksEstimateId: target?.quickbooksEstimateId ?? snapshot.linkedEstimateId,
      ...(realmId ? { quickbooksCompanyId: realmId } : {}),
    };

    const job = target
      ? await tx.job.update({ where: { id: target.id }, data: updatePayload })
      : await tx.job.create({
          data: {
            quickbooksInvoiceId: snapshot.id,
            quickbooksCustomerId: snapshot.customerId,
            customerName: snapshot.customerName,
            projectName: `Invoice #${snapshot.docNumber ?? snapshot.id}`,
            invoiceStatus: mapInvoiceStatus(snapshot.status),
            invoiceAmountCents: snapshot.totalAmtCents,
            amountPaidCents: snapshot.amountPaidCents,
            paidAt: snapshot.status === 'PAID' ? new Date() : null,
            quickbooksEstimateId: snapshot.linkedEstimateId ?? undefined,
            quickbooksCompanyId: realmId ?? undefined,
            estimateStatus: EstimateStatus.UNKNOWN,
            productionStatus: ProductionStatus.NOT_STARTED,
            boardStatus: BoardStatus.REQUESTED,
          },
        });

    const boardStatus = wasArchived ? job.boardStatus : deriveBoardStatus(job);
    const updated = await tx.job.update({ where: { id: job.id }, data: { boardStatus } });

    await tx.activityLog.create({
      data: {
        jobId: updated.id,
        source: EventSource.QUICKBOOKS,
        eventName: `invoice.${snapshot.status.toLowerCase()}`,
        message: `Invoice ${snapshot.id} synced from QuickBooks.`,
        metadata: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

export async function archiveJob(jobId: string, reason: ArchiveReason, message: string) {
  const current = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  if (current.archivedAt != null) {
    throw new Error('This job is already off the board.');
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      archivedAt: new Date(),
      archiveReason: reason,
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.APP,
      eventName: reason === ArchiveReason.DONE ? 'job.archived_done' : 'job.archived_lost',
      message,
    },
  });

  return updated;
}

export async function updateProductionStatus(jobId: string, productionStatus: ProductionStatus, eventName: string, message: string) {
  const current = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  if (current.archivedAt != null) {
    throw new Error('This job is off the board; restore it before changing production status.');
  }

  const timestamps: Partial<Job> = {};
  if (productionStatus === ProductionStatus.IN_PROGRESS && !current.startedAt) timestamps.startedAt = new Date();
  if (productionStatus === ProductionStatus.READY && !current.readyAt) timestamps.readyAt = new Date();
  if (productionStatus === ProductionStatus.DELIVERED && !current.deliveredAt) timestamps.deliveredAt = new Date();

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      productionStatus,
      ...timestamps,
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

  return finalJob;
}
