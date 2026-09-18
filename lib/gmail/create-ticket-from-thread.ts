import {
  BoardStatus,
  EstimateStatus,
  EventSource,
  GmailLinkSource,
  InboundLeadKind,
  InvoiceStatus,
  ProductionStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { upsertJobFromEstimate } from '@/lib/domain/sync';
import { applyThreadLink } from '@/lib/gmail/find-thread-for-job';
import { openGmailThreadAcrossMailboxes } from '@/lib/gmail/open-thread';
import {
  gmailBookmarkTicketExplanation,
  looksLikeGmailPaste,
  parseGmailThreadId,
  sanitizeGmailPaste,
  type GmailMailboxRef,
} from '@/lib/gmail/parse-thread-id';
import {
  gmailLeadProjectDescription,
  pickCustomerFromThreadMessages,
  threadMessagesFromGmail,
  type GmailThreadCustomer,
} from '@/lib/gmail/thread-customer';
import type { ScoredThreadCandidate } from '@/lib/gmail/thread-match';
import { resolveRealmIdForJob } from '@/lib/quickbooks/realm';
import { createUnsentEstimateFromEmail, ensureQboCustomer } from '@/lib/quickbooks/write-from-email';

export type CreateTicketFromGmailResult = {
  jobId: string;
  /** Thread was already on this ticket. */
  existed: boolean;
  /** QBO customer + draft estimate succeeded. */
  usedQuickBooks: boolean;
  customerCreated: boolean;
  qboError: string | null;
  syncError: string | null;
  /** Thread API open failed; ticket still created with the pasted URL saved. */
  bookmarkOnly: boolean;
};

/** Job page path after creating/linking from Gmail (paste form or add-on). */
export function ticketUrlForGmailResult(origin: string, result: CreateTicketFromGmailResult): string {
  const base = origin.replace(/\/+$/, '') || 'http://localhost:3000';
  const u = new URL(`/dashboard/jobs/${result.jobId}`, base);
  if (result.existed) {
    u.searchParams.set('from_gmail', 'exists');
  } else if (result.bookmarkOnly) {
    u.searchParams.set('from_gmail', 'bookmark');
    if (result.qboError) u.searchParams.set('qbo_error', result.qboError.slice(0, 280));
  } else if (result.usedQuickBooks) {
    u.searchParams.set('from_gmail', result.customerCreated ? 'qbo_new' : 'qbo');
  } else {
    u.searchParams.set('from_gmail', 'dash');
    if (result.qboError) u.searchParams.set('qbo_error', result.qboError.slice(0, 280));
  }
  if (result.syncError && !result.bookmarkOnly) {
    u.searchParams.set('gmail_sync_error', result.syncError.slice(0, 280));
  } else if (!result.existed && !result.bookmarkOnly) {
    u.searchParams.set('gmail_synced', '1');
  }
  u.hash = 'ticket-correspondence';
  return u.toString();
}

async function findJobForThread(resolvedThreadId: string, raw: string): Promise<{ id: string } | null> {
  const parsed = parseGmailThreadId(raw);
  const ids = [...new Set([resolvedThreadId, raw, parsed].filter((v): v is string => Boolean(v)))];
  const exact = await prisma.job.findFirst({
    where: {
      archivedAt: null,
      OR: ids.map((gmailThreadId) => ({ gmailThreadId })),
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (exact) return exact;

  if (resolvedThreadId.length >= 10) {
    const loose = await prisma.job.findFirst({
      where: { archivedAt: null, gmailThreadId: { contains: resolvedThreadId } },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (loose) return loose;
  }

  return prisma.job.findFirst({
    where: { OR: ids.map((gmailThreadId) => ({ gmailThreadId })) },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });
}

function candidateFromThread(opts: {
  threadId: string;
  gmailConnectionId: string;
  mailboxEmail: string;
  customer: GmailThreadCustomer;
  messageCount: number;
}): ScoredThreadCandidate {
  return {
    threadId: opts.threadId,
    gmailConnectionId: opts.gmailConnectionId,
    mailboxEmail: opts.mailboxEmail,
    subject: opts.customer.subject,
    snippet: opts.customer.snippet,
    participants: opts.customer.participants,
    messageCount: opts.messageCount,
    lastMessageAt: new Date().toISOString(),
    foundBy: 'customer_email_address',
    foundByLabel: 'pasted Gmail conversation',
    score: 100,
    signals: ['customer_email_address'],
    reasons: opts.customer.email
      ? [`Opened from a pasted Gmail thread with ${opts.customer.email}.`]
      : ['Opened from a pasted Gmail thread.'],
    counterparties: opts.customer.email ? [opts.customer.email] : [],
  };
}

async function attachThreadAndSeed(opts: {
  jobId: string;
  candidate: ScoredThreadCandidate;
  customer: GmailThreadCustomer;
}): Promise<string | null> {
  const linked = await applyThreadLink({
    jobId: opts.jobId,
    candidate: opts.candidate,
    source: GmailLinkSource.MANUAL,
    eventSource: EventSource.APP,
    sync: true,
  });

  if (opts.customer.email) {
    const existingSeed = await prisma.linkedEmail.findFirst({
      where: { jobId: opts.jobId, fromAddr: opts.customer.email },
      select: { id: true },
    });
    if (!existingSeed) {
      await prisma.linkedEmail.create({
        data: {
          jobId: opts.jobId,
          subject: opts.customer.subject.slice(0, 512) || null,
          fromAddr: opts.customer.email,
          notes: 'Customer email from the pasted Gmail thread.',
        },
      });
    }
  }

  return linked.syncError;
}

async function createDashOnlyLead(opts: {
  customerName: string;
  projectName: string;
  projectDescription: string;
  qboError: string | null;
  gmail?: {
    threadId: string;
    connectionId: string;
  };
}): Promise<string> {
  const job = await prisma.job.create({
    data: {
      customerName: opts.customerName.slice(0, 512),
      projectName: opts.projectName.slice(0, 512) || 'Email lead',
      projectDescription: opts.projectDescription.slice(0, 2000),
      inboundLeadKind: InboundLeadKind.GMAIL,
      boardStatus: BoardStatus.REQUESTED,
      productionStatus: ProductionStatus.NOT_STARTED,
      estimateStatus: EstimateStatus.UNKNOWN,
      invoiceStatus: InvoiceStatus.NONE,
      ...(opts.gmail
        ? {
            gmailThreadId: opts.gmail.threadId,
            gmailConnectionId: opts.gmail.connectionId,
            gmailLinkSource: GmailLinkSource.MANUAL,
            gmailLinkedAt: new Date(),
          }
        : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      jobId: job.id,
      source: EventSource.APP,
      eventName: 'inbound.gmail_thread',
      message: opts.qboError
        ? `Pre-quote ticket created from Gmail. ${opts.qboError}`
        : 'Pre-quote ticket created from a pasted Gmail thread.',
      metadata: {
        qboError: opts.qboError,
        gmailThreadId: opts.gmail?.threadId?.slice(0, 300),
      },
    },
  });

  return job.id;
}

async function loadMailboxes(): Promise<{ all: GmailMailboxRef[]; createdOrder: GmailMailboxRef[] }> {
  const rows = await prisma.gmailConnection.findMany({
    select: { id: true, googleEmail: true, createdAt: true },
  });
  const all = [...rows]
    .sort((a, b) => a.googleEmail.localeCompare(b.googleEmail))
    .map(({ id, googleEmail }) => ({ id, googleEmail }));
  const createdOrder = [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(({ id, googleEmail }) => ({ id, googleEmail }));
  return { all, createdOrder };
}

/**
 * Paste a Gmail conversation → QBO customer + unsent estimate + Dash ticket when
 * QuickBooks is connected and the thread opens; otherwise a Requested pre-quote ticket.
 * If Gmail cannot open the thread, the pasted URL is still saved on a Gmail-badge ticket.
 */
export async function createTicketFromGmailThread(opts: {
  threadUrlOrId: string;
  gmailConnectionId: string;
}): Promise<CreateTicketFromGmailResult> {
  const raw = sanitizeGmailPaste(opts.threadUrlOrId);
  if (!raw || !looksLikeGmailPaste(raw)) {
    throw new Error('Paste a Gmail conversation link (address bar or ⋮ → Copy link).');
  }

  const { all: mailboxes, createdOrder } = await loadMailboxes();
  const preferred = mailboxes.find((m) => m.id === opts.gmailConnectionId) ?? null;
  if (!preferred) {
    throw new Error('Choose which connected Gmail mailbox this thread lives in.');
  }

  return createTicketFromGmailThreadWithMailbox({
    raw,
    preferred,
    mailboxes,
    createdOrder,
  });
}

/**
 * Gmail add-on: contextual trigger already has the API thread id (and usually message id),
 * so Dash can `threads.get` instead of relying on a web-only Copy-link token.
 */
export async function createTicketFromGmailAddon(opts: {
  threadId: string;
  messageId?: string;
  mailboxEmail?: string;
}): Promise<CreateTicketFromGmailResult> {
  const threadId = sanitizeGmailPaste(opts.threadId);
  const messageId = sanitizeGmailPaste(opts.messageId ?? '');
  let raw = threadId || messageId;
  if (threadId && messageId && threadId !== messageId) {
    raw = `https://mail.google.com/mail/?th=${encodeURIComponent(threadId)}&permmsgid=${encodeURIComponent(messageId)}`;
  }
  if (!raw || !looksLikeGmailPaste(raw)) {
    throw new Error('Gmail did not send a thread id.');
  }

  const { all: mailboxes, createdOrder } = await loadMailboxes();
  if (mailboxes.length === 0) {
    throw new Error('Connect Gmail in Dash Settings first.');
  }

  const mailboxEmail = (opts.mailboxEmail ?? '').trim().toLowerCase();
  const preferred =
    mailboxes.find((m) => m.googleEmail.trim().toLowerCase() === mailboxEmail) ?? mailboxes[0]!;

  return createTicketFromGmailThreadWithMailbox({
    raw,
    preferred,
    mailboxes,
    createdOrder,
  });
}

async function createTicketFromGmailThreadWithMailbox(opts: {
  raw: string;
  preferred: GmailMailboxRef;
  mailboxes: GmailMailboxRef[];
  createdOrder: GmailMailboxRef[];
}): Promise<CreateTicketFromGmailResult> {
  const { raw, preferred, mailboxes, createdOrder } = opts;

  const opened = await openGmailThreadAcrossMailboxes({
    storedRaw: raw,
    preferredConnectionId: preferred.id,
    mailboxes,
    createdOrder,
  });

  if (!opened.ok) {
    const existing = await findJobForThread(raw, raw);
    if (existing) {
      return {
        jobId: existing.id,
        existed: true,
        usedQuickBooks: false,
        customerCreated: false,
        qboError: null,
        syncError: null,
        bookmarkOnly: false,
      };
    }

    const qboError = gmailBookmarkTicketExplanation(opened.triedEmails);
    const jobId = await createDashOnlyLead({
      customerName: 'Gmail lead',
      projectName: 'Email conversation',
      projectDescription: qboError,
      qboError,
      gmail: { threadId: raw, connectionId: preferred.id },
    });

    return {
      jobId,
      existed: false,
      usedQuickBooks: false,
      customerCreated: false,
      qboError,
      syncError: null,
      bookmarkOnly: true,
    };
  }

  const mailbox = opened.mailbox;
  const thread = opened.opened;
  const existing = await findJobForThread(thread.resolvedThreadId, raw);
  if (existing) {
    return {
      jobId: existing.id,
      existed: true,
      usedQuickBooks: false,
      customerCreated: false,
      qboError: null,
      syncError: null,
      bookmarkOnly: false,
    };
  }

  const shopEmails = mailboxes.map((m) => m.googleEmail);
  const headers = threadMessagesFromGmail(thread.data);
  const picked = pickCustomerFromThreadMessages(headers, shopEmails);
  const fallbackSubject =
    picked?.subject ||
    headers.find((m) => m.subject?.trim())?.subject?.trim() ||
    'Email conversation';
  const customer: GmailThreadCustomer = picked ?? {
    email: '',
    name: 'Gmail lead',
    subject: fallbackSubject.slice(0, 512),
    snippet: (thread.data.snippet ?? '').trim().slice(0, 500),
    participants: [],
  };

  const candidate = candidateFromThread({
    threadId: thread.resolvedThreadId,
    gmailConnectionId: mailbox.id,
    mailboxEmail: mailbox.googleEmail,
    customer,
    messageCount: thread.data.messages?.length ?? 1,
  });

  let qboError: string | null = null;
  let usedQuickBooks = false;
  let customerCreated = false;
  let jobId: string | null = null;

  if (!customer.email) {
    qboError = 'No customer email on that thread — QuickBooks skipped until the thread has an outside address.';
  } else {
    const realmId = await resolveRealmIdForJob(null);
    if (!realmId) {
      qboError = 'QuickBooks is not connected.';
    } else {
      try {
        const qboCustomer = await ensureQboCustomer({
          realmId,
          email: customer.email,
          displayName: customer.name,
        });
        customerCreated = qboCustomer.created;
        const estimate = await createUnsentEstimateFromEmail({
          realmId,
          customerId: qboCustomer.id,
          email: customer.email,
          subject: customer.subject,
          snippet: customer.snippet,
        });
        const job = await upsertJobFromEstimate(
          {
            ...estimate,
            status: 'DRAFT',
            customerName: qboCustomer.displayName,
            customerId: qboCustomer.id,
            projectDescription: gmailLeadProjectDescription(customer),
          },
          { realmId, syncDrive: false },
        );
        jobId = job.id;
        usedQuickBooks = true;
        if (job.inboundLeadKind == null) {
          await prisma.job.update({
            where: { id: job.id },
            data: { inboundLeadKind: InboundLeadKind.GMAIL },
          });
        }
      } catch (e) {
        qboError = e instanceof Error ? e.message : String(e);
        console.warn('[gmail/from-thread] QuickBooks path failed; falling back to pre-quote', e);
      }
    }
  }

  if (!jobId) {
    jobId = await createDashOnlyLead({
      customerName: customer.name || 'Gmail lead',
      projectName: customer.subject || 'Email lead',
      projectDescription: customer.email
        ? gmailLeadProjectDescription(customer)
        : (qboError ?? 'Pre-quote ticket from a pasted Gmail thread.'),
      qboError,
    });
  }

  const syncError = await attachThreadAndSeed({ jobId, candidate, customer });

  return {
    jobId,
    existed: false,
    usedQuickBooks,
    customerCreated,
    qboError,
    syncError,
    bookmarkOnly: false,
  };
}
