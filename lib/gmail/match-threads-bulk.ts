import { EventSource, GmailLinkSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  applyThreadLink,
  BULK_JOB_BUDGET,
  findGmailThreadCandidates,
  JOB_MATCH_SELECT,
  loadGmailMailboxes,
  recordThreadSuggestions,
} from '@/lib/gmail/find-thread-for-job';
import { syncGmailThreadForJob } from '@/lib/gmail/sync-thread';
import {
  THREAD_MATCH_DEFAULT_LOOKBACK_DAYS,
  toStoredThreadSuggestion,
  type StoredThreadSuggestion,
} from '@/lib/gmail/thread-match';

/** Each ticket costs up to six Gmail round trips under BULK_JOB_BUDGET; keep the batch small. */
export const THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS = 6;
export const THREAD_MATCH_SCAN_HARD_MAX_JOBS = 15;
export const THREAD_RESYNC_DEFAULT_MAX_JOBS = 5;
export const THREAD_RESYNC_HARD_MAX_JOBS = 10;

export type BulkMatchTicket = {
  jobId: string;
  customerName: string;
  projectName: string;
  outcome: 'linked' | 'suggested' | 'skipped' | 'none';
  reason: string;
  threadId: string | null;
  mailboxEmail: string | null;
  confidence: number | null;
  leadAddresses: string[];
  searched: string[];
  threadsInspected: number;
  suggestions: StoredThreadSuggestion[];
  errors: string[];
};

export type BulkMatchResult = {
  dryRun: boolean;
  lookbackDays: number;
  scanned: number;
  linked: number;
  suggested: number;
  mailboxes: string[];
  tickets: BulkMatchTicket[];
};

/**
 * Scans the most recently touched unlinked tickets and attaches a Gmail thread wherever
 * exactly one thread matches an address the ticket already knows about. Everything else is
 * left as a ranked suggestion on the ticket.
 *
 * Linking here does not sync: pulling messages and attachments for a whole batch does not fit
 * the function budget. Use the re-sync action afterwards.
 */
export async function scanJobsForGmailThreads(opts: {
  dryRun?: boolean;
  maxJobs?: number;
  lookbackDays?: number;
}): Promise<BulkMatchResult> {
  const dryRun = opts.dryRun ?? false;
  const maxJobs = Math.min(
    Math.max(opts.maxJobs ?? THREAD_MATCH_SCAN_DEFAULT_MAX_JOBS, 1),
    THREAD_MATCH_SCAN_HARD_MAX_JOBS,
  );
  const lookbackDays = Math.min(
    Math.max(opts.lookbackDays ?? THREAD_MATCH_DEFAULT_LOOKBACK_DAYS, 1),
    365,
  );

  const mailboxes = await loadGmailMailboxes();
  if (mailboxes.length === 0) {
    throw new Error('No Gmail mailbox is connected. Use Connect Gmail in Settings first.');
  }

  const jobs = await prisma.job.findMany({
    where: { gmailThreadId: null, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: maxJobs,
    select: JOB_MATCH_SELECT,
  });

  const tickets: BulkMatchTicket[] = [];
  let linked = 0;
  let suggested = 0;

  for (const job of jobs) {
    const run = await findGmailThreadCandidates(job, mailboxes, {
      budget: BULK_JOB_BUDGET,
      lookbackDays,
    });

    const base = {
      jobId: job.id,
      customerName: job.customerName,
      projectName: job.projectName,
      leadAddresses: run.profile.leadAddresses,
      searched: run.searched,
      threadsInspected: run.inspected.length,
      errors: run.errors,
    };

    if (run.action === 'auto_link' && run.best) {
      if (!dryRun) {
        await applyThreadLink({
          jobId: job.id,
          candidate: run.best,
          source: GmailLinkSource.AUTO,
          eventSource: EventSource.SYSTEM,
          sync: false,
        });
      }
      linked++;
      tickets.push({
        ...base,
        outcome: 'linked',
        reason: run.reason,
        threadId: run.best.threadId,
        mailboxEmail: run.best.mailboxEmail,
        confidence: run.best.score,
        suggestions: [toStoredThreadSuggestion(run.best)],
      });
      continue;
    }

    if (run.action === 'suggest') {
      const stored = dryRun
        ? run.suggestions.map(toStoredThreadSuggestion)
        : await recordThreadSuggestions(job.id, run, EventSource.SYSTEM);
      suggested++;
      tickets.push({
        ...base,
        outcome: 'suggested',
        reason: run.reason,
        threadId: null,
        mailboxEmail: null,
        confidence: run.best?.score ?? null,
        suggestions: stored,
      });
      continue;
    }

    tickets.push({
      ...base,
      outcome: 'none',
      reason: run.reason,
      threadId: null,
      mailboxEmail: null,
      confidence: null,
      suggestions: [],
    });
  }

  return {
    dryRun,
    lookbackDays,
    scanned: jobs.length,
    linked,
    suggested,
    mailboxes: mailboxes.map((m) => m.googleEmail),
    tickets,
  };
}

export type BulkResyncTicket = {
  jobId: string;
  customerName: string;
  messages: number;
  files: number;
  error: string | null;
};

export type BulkResyncResult = {
  scanned: number;
  succeeded: number;
  failed: number;
  tickets: BulkResyncTicket[];
};

/** Re-pulls messages and attachments for the most recently touched linked tickets. */
export async function resyncLinkedGmailThreads(opts: { maxJobs?: number }): Promise<BulkResyncResult> {
  const maxJobs = Math.min(
    Math.max(opts.maxJobs ?? THREAD_RESYNC_DEFAULT_MAX_JOBS, 1),
    THREAD_RESYNC_HARD_MAX_JOBS,
  );

  const jobs = await prisma.job.findMany({
    where: { gmailThreadId: { not: null }, gmailConnectionId: { not: null }, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: maxJobs,
    select: { id: true, customerName: true },
  });

  const tickets: BulkResyncTicket[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const { messages, files } = await syncGmailThreadForJob(job.id);
      await prisma.activityLog.create({
        data: {
          jobId: job.id,
          source: EventSource.SYSTEM,
          eventName: 'gmail.thread_synced',
          message: `Bulk re-sync: ${messages} message(s), ${files} new attachment file(s) downloaded.`,
        },
      });
      succeeded++;
      tickets.push({ jobId: job.id, customerName: job.customerName, messages, files, error: null });
    } catch (e) {
      failed++;
      tickets.push({
        jobId: job.id,
        customerName: job.customerName,
        messages: 0,
        files: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { scanned: jobs.length, succeeded, failed, tickets };
}
