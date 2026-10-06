import { EstimateStatus, EventSource, InboundLeadKind, type Job, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { usableQboDocId } from '@/lib/domain/hydrate-job-money';
import { listEstimatesByIds } from '@/lib/quickbooks/client';
import { estimateDepositReminderText } from '@/lib/quickbooks/config';
import {
  estimateCameFromGmail,
  estimateOpenForDeposit,
  fetchEstimateHasDepositRequest,
} from '@/lib/quickbooks/estimate-deposit';
import type { EstimateSnapshot } from '@/lib/quickbooks/types';

/**
 * Whether a Gmail-made estimate has QuickBooks' Deposit request turned on, read from its PDF and
 * cached in ActivityLog (no schema change). A new row is written only when the answer changes;
 * otherwise the latest row is updated with the estimate version it was checked at.
 */
export const DEPOSIT_CHECK_EVENT = 'quickbooks.estimate_deposit_check';

export type DepositCheck = {
  estimateId: string;
  /** Estimate MetaData.LastUpdatedTime the PDF was read at; a newer save means re-check. */
  estimateUpdatedAt: string | null;
  hasDepositRequest: boolean;
  /** Estimate was closed, converted or rejected after the check; no warning any more. */
  estimateClosed?: boolean;
  checkedAt: string;
};

type JobDepositFields = Pick<Job, 'archivedAt' | 'quickbooksEstimateId' | 'quickbooksInvoiceId' | 'estimateStatus'>;

export function parseDepositCheck(meta: Prisma.JsonValue | null | undefined): DepositCheck | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.estimateId !== 'string' || typeof m.hasDepositRequest !== 'boolean') return null;
  return {
    estimateId: m.estimateId,
    estimateUpdatedAt: typeof m.estimateUpdatedAt === 'string' ? m.estimateUpdatedAt : null,
    hasDepositRequest: m.hasDepositRequest,
    estimateClosed: m.estimateClosed === true,
    checkedAt: typeof m.checkedAt === 'string' ? m.checkedAt : '',
  };
}

/** Ticket still waiting on its estimate: on the board, not invoiced, not rejected. */
export function jobOpenForDepositWarning(job: JobDepositFields): boolean {
  return (
    job.archivedAt == null &&
    usableQboDocId(job.quickbooksEstimateId) &&
    !usableQboDocId(job.quickbooksInvoiceId) &&
    job.estimateStatus !== EstimateStatus.REJECTED
  );
}

export function depositWarningShows(job: JobDepositFields, check: DepositCheck | null): boolean {
  return (
    jobOpenForDepositWarning(job) &&
    check != null &&
    check.estimateId === job.quickbooksEstimateId &&
    !check.hasDepositRequest &&
    !check.estimateClosed
  );
}

/** Newest check for this estimate from logs ordered newest first (the ticket page already has them). */
export function depositCheckFromLogs(
  logs: ReadonlyArray<{ eventName: string; metadata: Prisma.JsonValue | null }>,
  estimateId: string | null | undefined,
): DepositCheck | null {
  if (!estimateId) return null;
  for (const log of logs) {
    if (log.eventName !== DEPOSIT_CHECK_EVENT) continue;
    const check = parseDepositCheck(log.metadata);
    if (check?.estimateId === estimateId) return check;
  }
  return null;
}

/** Board badge: cached results only, never a QuickBooks call. */
export async function jobIdsMissingEstimateDeposit(
  jobs: ReadonlyArray<JobDepositFields & { id: string }>,
): Promise<Set<string>> {
  const out = new Set<string>();
  const open = jobs.filter(jobOpenForDepositWarning);
  if (open.length === 0) return out;
  const rows = await prisma.activityLog.findMany({
    where: { jobId: { in: open.map((j) => j.id) }, eventName: DEPOSIT_CHECK_EVENT },
    orderBy: { createdAt: 'desc' },
    select: { jobId: true, eventName: true, metadata: true },
  });
  for (const job of open) {
    const check = depositCheckFromLogs(
      rows.filter((r) => r.jobId === job.id),
      job.quickbooksEstimateId,
    );
    if (depositWarningShows(job, check)) out.add(job.id);
  }
  return out;
}

function estimateLabel(estimate: EstimateSnapshot): string {
  return estimate.docNumber ? `Estimate #${estimate.docNumber}` : `Estimate ${estimate.id}`;
}

async function latestCheckRow(jobId: string) {
  const row = await prisma.activityLog.findFirst({
    where: { jobId, eventName: DEPOSIT_CHECK_EVENT },
    orderBy: { createdAt: 'desc' },
    select: { id: true, metadata: true },
  });
  const check = row ? parseDepositCheck(row.metadata) : null;
  return row && check ? { id: row.id, check } : null;
}

/** `changed`: the answer differs from the last check, so an open board should refresh. */
type CheckOutcome = { check: DepositCheck | null; changed: boolean; pdfRead: boolean };

async function saveCheck(
  jobId: string,
  estimate: EstimateSnapshot,
  latest: { id: string; check: DepositCheck } | null,
  next: DepositCheck,
): Promise<boolean> {
  const sameAnswer =
    latest?.check.estimateId === next.estimateId &&
    latest.check.hasDepositRequest === next.hasDepositRequest &&
    Boolean(latest.check.estimateClosed) === Boolean(next.estimateClosed);
  if (latest && (sameAnswer || next.estimateClosed)) {
    await prisma.activityLog.update({ where: { id: latest.id }, data: { metadata: next } });
    return !sameAnswer;
  }
  await prisma.activityLog.create({
    data: {
      jobId,
      source: EventSource.SYSTEM,
      eventName: DEPOSIT_CHECK_EVENT,
      message: next.hasDepositRequest
        ? `${estimateLabel(estimate)} has a deposit request in QuickBooks.`
        : `${estimateLabel(estimate)} has no deposit request in QuickBooks. ${estimateDepositReminderText()}`,
      metadata: next,
    },
  });
  return true;
}

async function checkEstimate(realmId: string, jobId: string, estimate: EstimateSnapshot): Promise<CheckOutcome> {
  if (!estimateCameFromGmail(estimate)) return { check: null, changed: false, pdfRead: false };
  const latest = await latestCheckRow(jobId);
  const updatedAt = estimate.metaLastUpdatedTime ?? null;

  if (!estimateOpenForDeposit(estimate)) {
    const prior = latest?.check.estimateId === estimate.id ? latest.check : null;
    if (!prior || prior.hasDepositRequest || prior.estimateClosed) return { check: null, changed: false, pdfRead: false };
    const closed: DepositCheck = { ...prior, estimateClosed: true, estimateUpdatedAt: updatedAt };
    return { check: closed, changed: await saveCheck(jobId, estimate, latest, closed), pdfRead: false };
  }

  if (latest && latest.check.estimateId === estimate.id && updatedAt && latest.check.estimateUpdatedAt === updatedAt) {
    return { check: latest.check, changed: false, pdfRead: false };
  }

  const hasDepositRequest = await fetchEstimateHasDepositRequest(realmId, estimate.id);
  if (hasDepositRequest == null) return { check: null, changed: false, pdfRead: true };
  const next: DepositCheck = {
    estimateId: estimate.id,
    estimateUpdatedAt: updatedAt,
    hasDepositRequest,
    checkedAt: new Date().toISOString(),
  };
  return { check: next, changed: await saveCheck(jobId, estimate, latest, next), pdfRead: true };
}

/**
 * Ticket page: re-reads the PDF only when the estimate was saved since the last check.
 * Null (logged) on any failure, so the page shows no warning rather than a wrong one.
 */
export async function refreshEstimateDepositCheck(opts: {
  realmId: string;
  jobId: string;
  estimate: EstimateSnapshot;
}): Promise<DepositCheck | null> {
  try {
    return (await checkEstimate(opts.realmId, opts.jobId, opts.estimate)).check;
  } catch (e) {
    console.warn('[deposit-check] ticket check failed', opts.jobId, e);
    return null;
  }
}

/**
 * Auto-sync: re-check Gmail estimates QuickBooks reported as changed, then backfill open Gmail
 * tickets that were never checked. Capped by PDF count and a deadline; failures are logged only.
 */
export async function refreshDepositChecksAfterSync(opts: {
  realmId: string;
  changedEstimates: EstimateSnapshot[];
  maxPdfs: number;
  deadlineAt: number;
}): Promise<{ pdfsRead: number; changed: number }> {
  const result = { pdfsRead: 0, changed: 0 };
  const run = async (jobId: string, estimate: EstimateSnapshot) => {
    try {
      const outcome = await checkEstimate(opts.realmId, jobId, estimate);
      if (outcome.pdfRead) result.pdfsRead += 1;
      if (outcome.changed) result.changed += 1;
    } catch (e) {
      console.warn('[deposit-check] sync check failed', jobId, estimate.id, e);
    }
  };
  const hasBudget = () => result.pdfsRead < opts.maxPdfs && Date.now() < opts.deadlineAt;

  const gmailChanged = opts.changedEstimates.filter(estimateCameFromGmail);
  const changedJobs = gmailChanged.length
    ? await prisma.job.findMany({
        where: { quickbooksEstimateId: { in: gmailChanged.map((e) => e.id) } },
        select: { id: true, quickbooksEstimateId: true, archivedAt: true, quickbooksInvoiceId: true, estimateStatus: true },
      })
    : [];
  for (const estimate of gmailChanged) {
    const job = changedJobs.find((j) => j.quickbooksEstimateId === estimate.id);
    if (!job || job.archivedAt != null || !hasBudget()) continue;
    // Invoiced or rejected tickets never warn; only a closing estimate still needs recording.
    if (!jobOpenForDepositWarning(job) && estimateOpenForDeposit(estimate)) continue;
    await run(job.id, estimate);
  }

  if (!hasBudget()) return result;
  const backfill = await prisma.job.findMany({
    where: {
      archivedAt: null,
      inboundLeadKind: InboundLeadKind.GMAIL,
      quickbooksEstimateId: { not: null, notIn: gmailChanged.map((e) => e.id) },
    },
    select: {
      id: true,
      quickbooksEstimateId: true,
      archivedAt: true,
      quickbooksInvoiceId: true,
      estimateStatus: true,
      activityLogs: {
        where: { eventName: DEPOSIT_CHECK_EVENT },
        orderBy: { createdAt: 'desc' },
        select: { eventName: true, metadata: true },
      },
    },
  });
  const unchecked = backfill.filter(
    (job) => jobOpenForDepositWarning(job) && !depositCheckFromLogs(job.activityLogs, job.quickbooksEstimateId),
  );
  if (unchecked.length === 0) return result;
  let estimates: EstimateSnapshot[];
  try {
    estimates = await listEstimatesByIds(
      opts.realmId,
      unchecked.map((j) => j.quickbooksEstimateId!),
    );
  } catch (e) {
    console.warn('[deposit-check] backfill estimate query failed', e);
    return result;
  }
  for (const job of unchecked) {
    if (!hasBudget()) break;
    const estimate = estimates.find((e) => e.id === job.quickbooksEstimateId);
    if (estimate && estimateCameFromGmail(estimate) && estimateOpenForDeposit(estimate)) await run(job.id, estimate);
  }
  return result;
}
