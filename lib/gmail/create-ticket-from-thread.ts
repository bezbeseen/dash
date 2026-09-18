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
import { looksLikeQboDocProjectName, preferHumanProjectName } from '@/lib/domain/job-display';
import { replaceJobEstimateFromSnapshot, restoreJobToBoard, upsertJobFromEstimate } from '@/lib/domain/sync';
import { applyThreadLink } from '@/lib/gmail/find-thread-for-job';
import { openGmailThreadAcrossMailboxes } from '@/lib/gmail/open-thread';
import {
  gmailBookmarkTicketExplanation,
  looksLikeGmailPaste,
  sanitizeGmailPaste,
  type GmailMailboxRef,
} from '@/lib/gmail/parse-thread-id';
import {
  gmailThreadIdCandidates,
  jobRowMatchesGmailThread,
  pickJobForGmailThread,
  type GmailThreadJobHit,
} from '@/lib/gmail/thread-job-match';
import {
  gmailLeadProjectDescription,
  pickCustomerFromThreadMessages,
  sanitizeGmailTicketLabel,
  threadMessagesFromGmail,
  type GmailThreadCustomer,
} from '@/lib/gmail/thread-customer';
import type { ScoredThreadCandidate } from '@/lib/gmail/thread-match';
import { fetchEstimateById } from '@/lib/quickbooks/client';
import { isSyntheticQuickBooksId } from '@/lib/quickbooks/invoice-activity';
import { resolveRealmIdForJob } from '@/lib/quickbooks/realm';
import {
  createUnsentEstimateFromEmail,
  ensureQboCustomer,
  maybeSetMissingPrimaryPhone,
  qboFaultLooksLikeMissingOrInactiveEstimate,
} from '@/lib/quickbooks/write-from-email';

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
  /** Existing ticket was off the board (Dismissed/Lost/Done) and was restored. */
  restored?: boolean;
  customerName?: string | null;
  ticketLabel?: string | null;
  estimateNumber?: string | null;
  /** Matched job has no usable QBO estimate — add-on may offer Create estimate anyway. */
  needsEstimate?: boolean;
  /** forceEstimate created a new QBO estimate on the existing job (did not mint a second Job). */
  estimateCreated?: boolean;
};

/** Job page path after creating/linking from Gmail (paste form or add-on). */
export function ticketUrlForGmailResult(origin: string, result: CreateTicketFromGmailResult): string {
  const base = origin.replace(/\/+$/, '') || 'http://localhost:3000';
  const u = new URL(`/dashboard/jobs/${result.jobId}`, base);
  if (result.restored) {
    u.searchParams.set('restored', '1');
  }
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

function estimateNumberFromProjectName(projectName: string | null | undefined): string | null {
  const m = (projectName ?? '').trim().match(/^Estimate\s+#?\s*(.+)$/i);
  const n = m?.[1]?.trim();
  return n || null;
}

async function attachGmailTicketCardFields(
  result: CreateTicketFromGmailResult,
  extras?: { ticketLabel?: string },
): Promise<CreateTicketFromGmailResult> {
  const job = await prisma.job.findUnique({
    where: { id: result.jobId },
    select: { customerName: true, projectName: true },
  });
  const fromJob = job?.projectName?.trim() || '';
  const typed = extras?.ticketLabel?.trim() || '';
  const ticketLabel =
    (fromJob && !looksLikeQboDocProjectName(fromJob) ? fromJob : '') || typed || fromJob || null;
  const estimateNumber =
    result.estimateNumber?.trim() ||
    (result.needsEstimate ? null : estimateNumberFromProjectName(fromJob)) ||
    null;
  return {
    ...result,
    customerName: job?.customerName?.trim() || result.customerName || null,
    ticketLabel,
    estimateNumber,
  };
}

async function findJobForThread(
  resolvedThreadId: string,
  raw: string,
  preferredConnectionId?: string | null,
): Promise<GmailThreadJobHit | null> {
  const candidates = gmailThreadIdCandidates(resolvedThreadId, raw);
  if (candidates.length === 0) return null;

  const containsIds = candidates.filter((id) => id.length >= 10);
  const rows = await prisma.job.findMany({
    where: {
      OR: [
        { gmailThreadId: { in: candidates } },
        ...containsIds.map((id) => ({ gmailThreadId: { contains: id } })),
      ],
    },
    select: {
      id: true,
      archivedAt: true,
      updatedAt: true,
      gmailConnectionId: true,
      gmailThreadId: true,
    },
  });

  const matches = rows.filter((row) => jobRowMatchesGmailThread(row.gmailThreadId, candidates));
  return pickJobForGmailThread(matches, { preferredConnectionId });
}

async function reopenExistingGmailJob(opts: {
  jobId: string;
  ticketLabel?: string;
  customer?: GmailThreadCustomer | null;
}): Promise<{ restored: boolean }> {
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  if (!job) return { restored: false };

  let restored = false;
  if (job.archivedAt != null) {
    await restoreJobToBoard(job.id);
    restored = true;
  }

  const phone = opts.customer?.phone;
  if (phone && job.quickbooksCustomerId) {
    const realmId = await resolveRealmIdForJob(job.quickbooksCompanyId);
    if (realmId) {
      await maybeSetMissingPrimaryPhone(realmId, job.quickbooksCustomerId, phone);
    }
  }

  const data: { projectName?: string; projectDescription?: string } = {};
  const label = opts.ticketLabel?.trim();
  if (label) {
    const nextName = preferHumanProjectName(job.projectName, label);
    const betterLabel =
      looksLikeQboDocProjectName(job.projectName) && !looksLikeQboDocProjectName(label);
    if (betterLabel && nextName !== job.projectName) {
      data.projectName = nextName.slice(0, 512);
    }
  }
  if (phone && !/^Phone:/m.test(job.projectDescription ?? '')) {
    const line = `Phone: ${phone}`;
    const desc = (job.projectDescription ?? '').trim();
    data.projectDescription = (
      !desc
        ? gmailLeadProjectDescription(opts.customer!)
        : /^Email:/m.test(desc)
          ? desc.replace(/^(Email:[^\n]*)/m, `$1\n${line}`)
          : `${desc}\n${line}`
    ).slice(0, 2000);
  }
  if (Object.keys(data).length > 0) {
    await prisma.job.update({ where: { id: job.id }, data });
  }

  return { restored };
}

async function inspectJobQboEstimate(jobId: string): Promise<{
  usable: boolean;
  estimateNumber: string | null;
}> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { quickbooksEstimateId: true, quickbooksCompanyId: true, projectName: true },
  });
  const estimateId = job?.quickbooksEstimateId?.trim() || '';
  if (!estimateId || isSyntheticQuickBooksId(estimateId)) {
    return { usable: false, estimateNumber: null };
  }

  const realmId = await resolveRealmIdForJob(job?.quickbooksCompanyId);
  if (!realmId) {
    return { usable: false, estimateNumber: null };
  }

  try {
    const snap = await fetchEstimateById(realmId, estimateId);
    if (!snap.id) return { usable: false, estimateNumber: null };
    return {
      usable: true,
      estimateNumber: snap.docNumber?.trim() || estimateNumberFromProjectName(job?.projectName) || null,
    };
  } catch (e) {
    if (qboFaultLooksLikeMissingOrInactiveEstimate(e)) {
      return { usable: false, estimateNumber: null };
    }
    return {
      usable: true,
      estimateNumber: estimateNumberFromProjectName(job?.projectName),
    };
  }
}

async function mintEstimateOnExistingJob(opts: {
  jobId: string;
  customer: GmailThreadCustomer;
  ticketLabel: string;
}): Promise<{ customerCreated: boolean; estimateNumber: string | null }> {
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  if (!job) throw new Error('Ticket not found.');

  const realmId = await resolveRealmIdForJob(job.quickbooksCompanyId);
  if (!realmId) throw new Error('QuickBooks is not connected.');

  const email = opts.customer.email.trim().toLowerCase();
  let customerCreated = false;
  let customerId = job.quickbooksCustomerId?.trim() || '';
  let displayName = job.customerName;

  if (email) {
    const qboCustomer = await ensureQboCustomer({
      realmId,
      email,
      displayName: opts.customer.name || job.customerName,
      phone: opts.customer.phone,
    });
    customerCreated = qboCustomer.created;
    customerId = qboCustomer.id;
    displayName = qboCustomer.displayName;
  } else if (customerId) {
    await maybeSetMissingPrimaryPhone(realmId, customerId, opts.customer.phone);
  } else {
    throw new Error(
      'No customer email on that thread — QuickBooks skipped until the thread has an outside address.',
    );
  }

  const subject = sanitizeGmailTicketLabel(opts.ticketLabel, job.projectName || 'Email lead');
  const estimate = await createUnsentEstimateFromEmail({
    realmId,
    customerId,
    email,
    subject,
    snippet: opts.customer.snippet || '',
  });

  await replaceJobEstimateFromSnapshot(
    job.id,
    {
      ...estimate,
      status: 'DRAFT',
      customerName: displayName,
      customerId,
      projectName: subject,
      projectDescription: email ? gmailLeadProjectDescription(opts.customer) : estimate.projectDescription,
    },
    { realmId, syncDrive: false },
  );

  return { customerCreated, estimateNumber: estimate.docNumber?.trim() || null };
}

async function finishExistingGmailJob(opts: {
  jobId: string;
  ticketLabel?: string;
  customer?: GmailThreadCustomer | null;
  forceEstimate: boolean;
  threadOpened: boolean;
}): Promise<CreateTicketFromGmailResult> {
  const { restored } = await reopenExistingGmailJob({
    jobId: opts.jobId,
    ticketLabel: opts.ticketLabel,
    customer: opts.customer,
  });

  const health = await inspectJobQboEstimate(opts.jobId);
  const base = {
    jobId: opts.jobId,
    existed: true as const,
    customerCreated: false,
    syncError: null,
    bookmarkOnly: false as const,
    restored,
  };

  if (opts.forceEstimate) {
    if (health.usable) {
      return {
        ...base,
        usedQuickBooks: false,
        qboError: null,
        needsEstimate: false,
        estimateCreated: false,
        estimateNumber: health.estimateNumber,
      };
    }

    if (!opts.threadOpened || !opts.customer) {
      return {
        ...base,
        usedQuickBooks: false,
        qboError: 'Could not open that conversation, so a new QuickBooks estimate was not created.',
        needsEstimate: true,
      };
    }

    try {
      const minted = await mintEstimateOnExistingJob({
        jobId: opts.jobId,
        customer: opts.customer,
        ticketLabel: opts.ticketLabel || '',
      });
      return {
        ...base,
        usedQuickBooks: true,
        customerCreated: minted.customerCreated,
        qboError: null,
        needsEstimate: false,
        estimateCreated: true,
        estimateNumber: minted.estimateNumber,
      };
    } catch (e) {
      return {
        ...base,
        usedQuickBooks: false,
        qboError: e instanceof Error ? e.message : String(e),
        needsEstimate: true,
      };
    }
  }

  return {
    ...base,
    usedQuickBooks: false,
    qboError: null,
    needsEstimate: !health.usable,
    estimateNumber: health.usable ? health.estimateNumber : null,
  };
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

  return attachGmailTicketCardFields(
    await createTicketFromGmailThreadWithMailbox({
      raw,
      preferred,
      mailboxes,
      createdOrder,
    }),
  );
}

/**
 * Gmail add-on: contextual trigger already has the API thread id (and usually message id),
 * so Dash can `threads.get` instead of relying on a web-only Copy-link token.
 */
export async function createTicketFromGmailAddon(opts: {
  threadId: string;
  messageId?: string;
  mailboxEmail?: string;
  ticketLabel?: string;
  forceEstimate?: boolean;
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

  return attachGmailTicketCardFields(
    await createTicketFromGmailThreadWithMailbox({
      raw,
      preferred,
      mailboxes,
      createdOrder,
      ticketLabel: opts.ticketLabel,
      forceEstimate: Boolean(opts.forceEstimate),
    }),
    { ticketLabel: opts.ticketLabel },
  );
}

async function createTicketFromGmailThreadWithMailbox(opts: {
  raw: string;
  preferred: GmailMailboxRef;
  mailboxes: GmailMailboxRef[];
  createdOrder: GmailMailboxRef[];
  ticketLabel?: string;
  forceEstimate?: boolean;
}): Promise<CreateTicketFromGmailResult> {
  const { raw, preferred, mailboxes, createdOrder } = opts;

  const opened = await openGmailThreadAcrossMailboxes({
    storedRaw: raw,
    preferredConnectionId: preferred.id,
    mailboxes,
    createdOrder,
  });

  if (!opened.ok) {
    const existing = await findJobForThread(raw, raw, preferred.id);
    if (existing) {
      return finishExistingGmailJob({
        jobId: existing.id,
        ticketLabel: opts.ticketLabel,
        customer: null,
        forceEstimate: Boolean(opts.forceEstimate),
        threadOpened: false,
      });
    }

    const qboError = gmailBookmarkTicketExplanation(opened.triedEmails);
    const bookmarkLabel = sanitizeGmailTicketLabel(opts.ticketLabel, 'Email conversation');
    const jobId = await createDashOnlyLead({
      customerName: 'Gmail lead',
      projectName: bookmarkLabel,
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
  const shopEmails = mailboxes.map((m) => m.googleEmail);
  const messages = threadMessagesFromGmail(thread.data);
  const picked = pickCustomerFromThreadMessages(messages, shopEmails);
  const fallbackSubject =
    picked?.subject ||
    messages.find((m) => m.subject?.trim())?.subject?.trim() ||
    'Email conversation';
  const customer: GmailThreadCustomer = picked ?? {
    email: '',
    name: 'Gmail lead',
    subject: fallbackSubject.slice(0, 512),
    snippet: (thread.data.snippet ?? '').trim().slice(0, 500),
    participants: [],
  };
  const ticketLabel = sanitizeGmailTicketLabel(opts.ticketLabel, customer.subject || fallbackSubject);

  const existing = await findJobForThread(thread.resolvedThreadId, raw, mailbox.id);
  if (existing) {
    return finishExistingGmailJob({
      jobId: existing.id,
      ticketLabel,
      customer,
      forceEstimate: Boolean(opts.forceEstimate),
      threadOpened: true,
    });
  }

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
  let estimateNumber: string | null = null;

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
          phone: customer.phone,
        });
        customerCreated = qboCustomer.created;
        const estimate = await createUnsentEstimateFromEmail({
          realmId,
          customerId: qboCustomer.id,
          email: customer.email,
          subject: ticketLabel,
          snippet: customer.snippet,
        });
        const job = await upsertJobFromEstimate(
          {
            ...estimate,
            status: 'DRAFT',
            customerName: qboCustomer.displayName,
            customerId: qboCustomer.id,
            projectName: ticketLabel,
            projectDescription: gmailLeadProjectDescription(customer),
          },
          { realmId, syncDrive: false },
        );
        jobId = job.id;
        usedQuickBooks = true;
        estimateNumber = estimate.docNumber?.trim() || null;
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
      projectName: ticketLabel,
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
    estimateNumber,
  };
}
