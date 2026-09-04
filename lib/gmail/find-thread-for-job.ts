import { EventSource, GmailLinkSource } from '@prisma/client';
import { google, gmail_v1 } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { gmailHeader } from '@/lib/gmail/message-text';
import { syncGmailThreadForJob } from '@/lib/gmail/sync-thread';
import {
  buildCounterpartyFilter,
  buildJobMatchProfile,
  buildThreadSearchPlan,
  decideThreadMatch,
  describeThreadMatchSignal,
  parseAddressEntries,
  scoreThreadCandidate,
  toStoredThreadSuggestion,
  THREAD_MATCH_DEFAULT_LOOKBACK_DAYS,
  type AddressEntry,
  type JobMatchProfile,
  type ScoredThreadCandidate,
  type StoredThreadSuggestion,
  type ThreadCandidate,
  type ThreadMatchAction,
} from '@/lib/gmail/thread-match';
import { getGmailOAuth2ClientForConnection } from '@/lib/gmail/tokens-db';

/**
 * Caps every automatic match against Gmail. Worst case per job is
 * `maxListCalls + maxThreadsInspected` API round trips, which is what keeps a run
 * predictable on a serverless function budget.
 */
export type ThreadSearchBudget = {
  maxListCalls: number;
  maxThreadsInspected: number;
  maxResultsPerQuery: number;
  /** Skip subject / customer-name searches, which are the expensive low-yield ones. */
  addressSignalsOnly: boolean;
};

/** One ticket at a time: a human is waiting, so spend a little more to get suggestions. */
export const SINGLE_JOB_BUDGET: ThreadSearchBudget = {
  maxListCalls: 8,
  maxThreadsInspected: 6,
  maxResultsPerQuery: 5,
  addressSignalsOnly: false,
};

/** Many tickets in one request: only the signals that can actually auto-link. */
export const BULK_JOB_BUDGET: ThreadSearchBudget = {
  maxListCalls: 3,
  maxThreadsInspected: 3,
  maxResultsPerQuery: 4,
  addressSignalsOnly: true,
};

const THREAD_FETCH_BATCH_SIZE = 3;
const MAX_MESSAGES_INSPECTED_PER_THREAD = 12;
const METADATA_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

export type GmailMailbox = { id: string; googleEmail: string };

export type JobForMatching = {
  id: string;
  customerName: string;
  projectName: string;
  projectDescription: string | null;
  gmailThreadId: string | null;
  gmailConnectionId: string | null;
  gmailLinkSource: GmailLinkSource | null;
  linkedEmails: { fromAddr: string | null; toAddr: string | null; linkUrl: string | null; notes: string | null }[];
};

export type ThreadMatchRun = {
  profile: JobMatchProfile;
  action: ThreadMatchAction;
  reason: string;
  best: ScoredThreadCandidate | null;
  suggestions: ScoredThreadCandidate[];
  /** Every thread that was looked at, including the ones scored out — this is what the preview shows. */
  inspected: ScoredThreadCandidate[];
  searched: string[];
  errors: string[];
};

export const JOB_MATCH_SELECT = {
  id: true,
  customerName: true,
  projectName: true,
  projectDescription: true,
  gmailThreadId: true,
  gmailConnectionId: true,
  gmailLinkSource: true,
  linkedEmails: {
    select: { fromAddr: true, toAddr: true, linkUrl: true, notes: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  },
} as const;

export async function loadGmailMailboxes(): Promise<GmailMailbox[]> {
  const rows = await prisma.gmailConnection.findMany({
    orderBy: { googleEmail: 'asc' },
    take: 3,
    select: { id: true, googleEmail: true },
  });
  return rows;
}

function lastMessageIso(messages: gmail_v1.Schema$Message[]): string | null {
  let newest: number | null = null;
  for (const m of messages) {
    const raw = m.internalDate ? Number(m.internalDate) : NaN;
    if (Number.isFinite(raw) && (newest === null || raw > newest)) newest = raw;
  }
  if (newest !== null) return new Date(newest).toISOString();

  for (let i = messages.length - 1; i >= 0; i--) {
    const header = gmailHeader(messages[i]?.payload?.headers, 'Date');
    if (!header) continue;
    const d = new Date(header);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function threadToCandidate(
  thread: gmail_v1.Schema$Thread,
  threadId: string,
  mailbox: GmailMailbox,
  foundBy: ThreadCandidate['foundBy'],
  foundByLabel: string,
): ThreadCandidate {
  const messages = (thread.messages ?? []).slice(0, MAX_MESSAGES_INSPECTED_PER_THREAD);
  const byAddress = new Map<string, AddressEntry>();
  let subject = '';

  for (const m of messages) {
    const headers = m.payload?.headers;
    if (!subject) subject = gmailHeader(headers, 'Subject');
    for (const header of ['From', 'To', 'Cc'] as const) {
      for (const entry of parseAddressEntries(gmailHeader(headers, header))) {
        const existing = byAddress.get(entry.address);
        if (!existing || (!existing.name && entry.name)) byAddress.set(entry.address, entry);
      }
    }
  }

  return {
    threadId,
    gmailConnectionId: mailbox.id,
    mailboxEmail: mailbox.googleEmail,
    subject,
    snippet: (messages[messages.length - 1]?.snippet ?? thread.snippet ?? '').slice(0, 300),
    participants: [...byAddress.values()],
    messageCount: thread.messages?.length ?? messages.length,
    lastMessageAt: lastMessageIso(messages),
    foundBy,
    foundByLabel,
  };
}

/**
 * Searches every connected mailbox for threads that could belong to `job` and scores them.
 * Writes nothing.
 */
export async function findGmailThreadCandidates(
  job: JobForMatching,
  mailboxes: readonly GmailMailbox[],
  opts: { budget?: ThreadSearchBudget; lookbackDays?: number } = {},
): Promise<ThreadMatchRun> {
  const budget = opts.budget ?? SINGLE_JOB_BUDGET;
  const lookbackDays = Math.min(
    Math.max(opts.lookbackDays ?? THREAD_MATCH_DEFAULT_LOOKBACK_DAYS, 1),
    365,
  );

  const filter = buildCounterpartyFilter(mailboxes.map((m) => m.googleEmail));
  const profile = buildJobMatchProfile(
    {
      jobId: job.id,
      customerName: job.customerName,
      projectName: job.projectName,
      projectDescription: job.projectDescription,
      linkedEmails: job.linkedEmails,
    },
    filter,
  );

  const plan = buildThreadSearchPlan(profile, {
    lookbackDays,
    maxSteps: budget.maxListCalls,
    addressSignalsOnly: budget.addressSignalsOnly,
  });

  const errors: string[] = [];
  const searched: string[] = [];

  if (plan.length === 0 || mailboxes.length === 0) {
    return {
      profile,
      action: 'none',
      reason:
        mailboxes.length === 0
          ? 'No Gmail mailbox is connected.'
          : 'Nothing on this ticket identifies the customer — no email address, project name or document number to search on.',
      best: null,
      suggestions: [],
      inspected: [],
      searched,
      errors,
    };
  }

  // One OAuth client per mailbox: building it hits the database and may refresh the token.
  const clients = new Map<string, gmail_v1.Gmail>();
  const clientFor = async (mailbox: GmailMailbox): Promise<gmail_v1.Gmail> => {
    const cached = clients.get(mailbox.id);
    if (cached) return cached;
    const auth = await getGmailOAuth2ClientForConnection(mailbox.id);
    const gmail = google.gmail({ version: 'v1', auth });
    clients.set(mailbox.id, gmail);
    return gmail;
  };

  type Hit = { threadId: string; mailbox: GmailMailbox; foundBy: ThreadCandidate['foundBy']; label: string };
  const hits = new Map<string, Hit>();
  let listCalls = 0;

  outer: for (const step of plan) {
    for (const mailbox of mailboxes) {
      if (listCalls >= budget.maxListCalls) break outer;
      if (hits.size >= budget.maxThreadsInspected) break outer;
      listCalls++;
      searched.push(`${mailbox.googleEmail}: ${step.query}`);
      try {
        const gmail = await clientFor(mailbox);
        const list = await gmail.users.threads.list({
          userId: 'me',
          q: step.query,
          maxResults: budget.maxResultsPerQuery,
        });
        for (const t of list.data.threads ?? []) {
          if (!t.id) continue;
          const key = `${mailbox.id}:${t.id}`;
          if (hits.has(key)) continue;
          if (hits.size >= budget.maxThreadsInspected) break;
          hits.set(key, { threadId: t.id, mailbox, foundBy: step.signal, label: step.label });
        }
      } catch (e) {
        errors.push(`${mailbox.googleEmail}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const hitList = [...hits.values()];
  const scored: ScoredThreadCandidate[] = [];

  for (let i = 0; i < hitList.length; i += THREAD_FETCH_BATCH_SIZE) {
    const batch = hitList.slice(i, i + THREAD_FETCH_BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async (hit) => {
        try {
          const gmail = await clientFor(hit.mailbox);
          const res = await gmail.users.threads.get({
            userId: 'me',
            id: hit.threadId,
            format: 'metadata',
            metadataHeaders: METADATA_HEADERS,
          });
          return { hit, thread: res.data, error: null as string | null };
        } catch (e) {
          return { hit, thread: null, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    for (const item of fetched) {
      if (!item.thread) {
        errors.push(`thread ${item.hit.threadId}: ${item.error ?? 'fetch failed'}`);
        continue;
      }
      const candidate = threadToCandidate(
        item.thread,
        item.hit.threadId,
        item.hit.mailbox,
        item.hit.foundBy,
        item.hit.label,
      );
      scored.push(scoreThreadCandidate(profile, candidate, filter));
    }
  }

  const decision = decideThreadMatch(scored);
  return {
    profile,
    action: decision.action,
    reason: decision.reason,
    best: decision.best,
    suggestions: decision.suggestions,
    inspected: scored,
    searched,
    errors,
  };
}

/** A human-set or human-confirmed link is authoritative and is never replaced automatically. */
export function linkIsProtected(job: Pick<JobForMatching, 'gmailThreadId' | 'gmailLinkSource'>): boolean {
  if (!job.gmailThreadId) return false;
  return job.gmailLinkSource !== GmailLinkSource.AUTO;
}

export type ThreadLinkOutcome =
  | { status: 'linked'; threadId: string; mailboxEmail: string; confidence: number; synced: { messages: number; files: number } | null; syncError: string | null }
  | { status: 'suggested'; suggestions: StoredThreadSuggestion[]; reason: string }
  | { status: 'skipped'; reason: string }
  | { status: 'none'; reason: string };

export async function applyThreadLink(opts: {
  jobId: string;
  candidate: ScoredThreadCandidate;
  source: GmailLinkSource;
  eventSource: EventSource;
  sync: boolean;
}): Promise<Extract<ThreadLinkOutcome, { status: 'linked' }>> {
  const { jobId, candidate, source } = opts;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      gmailThreadId: candidate.threadId,
      gmailConnectionId: candidate.gmailConnectionId,
      gmailLinkSource: source,
      gmailLinkedAt: new Date(),
      gmailLinkConfidence: candidate.score,
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId,
      source: opts.eventSource,
      eventName: source === GmailLinkSource.CONFIRMED ? 'gmail.thread_confirmed' : 'gmail.thread_auto_linked',
      message:
        `Gmail thread attached ${source === GmailLinkSource.CONFIRMED ? 'from a suggestion' : 'automatically'} ` +
        `(${candidate.mailboxEmail}, confidence ${candidate.score}) — ${describeThreadMatchSignal(candidate.signals[0] ?? 'customer_name')}.`,
      metadata: {
        threadId: candidate.threadId,
        mailboxEmail: candidate.mailboxEmail,
        gmailConnectionId: candidate.gmailConnectionId,
        confidence: candidate.score,
        signals: candidate.signals,
        reasons: candidate.reasons,
        counterparties: candidate.counterparties,
        subject: candidate.subject.slice(0, 300),
        linkSource: source,
      },
    },
  });

  let synced: { messages: number; files: number } | null = null;
  let syncError: string | null = null;
  if (opts.sync) {
    try {
      synced = await syncGmailThreadForJob(jobId);
      await prisma.activityLog.create({
        data: {
          jobId,
          source: opts.eventSource,
          eventName: 'gmail.thread_synced',
          message: `Synced Gmail thread: ${synced.messages} message(s), ${synced.files} new attachment file(s) downloaded.`,
        },
      });
    } catch (e) {
      syncError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    status: 'linked',
    threadId: candidate.threadId,
    mailboxEmail: candidate.mailboxEmail,
    confidence: candidate.score,
    synced,
    syncError,
  };
}

export async function recordThreadSuggestions(
  jobId: string,
  run: ThreadMatchRun,
  eventSource: EventSource,
): Promise<StoredThreadSuggestion[]> {
  const stored = run.suggestions.map(toStoredThreadSuggestion);
  await prisma.activityLog.create({
    data: {
      jobId,
      source: eventSource,
      eventName: 'gmail.thread_suggested',
      message: `Found ${stored.length} possible Gmail thread${stored.length === 1 ? '' : 's'} but did not attach any — ${run.reason}`,
      metadata: { reason: run.reason, candidates: stored, searched: run.searched.slice(0, 8) },
    },
  });
  return stored;
}

/**
 * Full per-ticket flow: search, then either attach a single unambiguous match or leave
 * ranked suggestions on the ticket for a human to accept.
 */
export async function matchGmailThreadForJob(opts: {
  jobId: string;
  budget?: ThreadSearchBudget;
  lookbackDays?: number;
  eventSource?: EventSource;
  sync?: boolean;
  dryRun?: boolean;
}): Promise<{ run: ThreadMatchRun; outcome: ThreadLinkOutcome }> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: opts.jobId },
    select: JOB_MATCH_SELECT,
  });

  if (linkIsProtected(job)) {
    const run: ThreadMatchRun = {
      profile: buildJobMatchProfile(
        { jobId: job.id, customerName: job.customerName, projectName: job.projectName },
        buildCounterpartyFilter([]),
      ),
      action: 'none',
      reason: 'A person already chose the thread for this ticket.',
      best: null,
      suggestions: [],
      inspected: [],
      searched: [],
      errors: [],
    };
    return { run, outcome: { status: 'skipped', reason: run.reason } };
  }

  const mailboxes = await loadGmailMailboxes();
  const run = await findGmailThreadCandidates(job, mailboxes, {
    budget: opts.budget,
    lookbackDays: opts.lookbackDays,
  });

  const eventSource = opts.eventSource ?? EventSource.APP;

  if (run.action === 'auto_link' && run.best) {
    if (opts.dryRun) {
      return { run, outcome: { status: 'skipped', reason: 'Dry run — would have attached this thread.' } };
    }
    if (job.gmailThreadId === run.best.threadId) {
      return { run, outcome: { status: 'skipped', reason: 'Already attached to that thread.' } };
    }
    const linked = await applyThreadLink({
      jobId: job.id,
      candidate: run.best,
      source: GmailLinkSource.AUTO,
      eventSource,
      sync: opts.sync ?? false,
    });
    return { run, outcome: linked };
  }

  if (run.action === 'suggest') {
    if (opts.dryRun) {
      return {
        run,
        outcome: { status: 'suggested', suggestions: run.suggestions.map(toStoredThreadSuggestion), reason: run.reason },
      };
    }
    const stored = await recordThreadSuggestions(job.id, run, eventSource);
    return { run, outcome: { status: 'suggested', suggestions: stored, reason: run.reason } };
  }

  return { run, outcome: { status: 'none', reason: run.reason } };
}
