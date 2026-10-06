import { Prisma, type AutoSyncState } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { persistCustomerDepositCents } from '@/lib/domain/customer-deposit';
import { refreshDepositChecksAfterSync } from '@/lib/domain/estimate-deposit-check';
import { usableQboDocId } from '@/lib/domain/hydrate-job-money';
import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';
import { scanYelpLeadEmailsAllMailboxes } from '@/lib/gmail/scan-yelp-lead-emails';
import {
  listEstimatesChangedSince,
  listInvoicesByIds,
  listInvoicesChangedSince,
  listPaymentsChangedSince,
  type QboChangeBatch,
} from '@/lib/quickbooks/client';

const STATE_ID = 'default';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Open tabs ask every few minutes; a run that started more recently than this is not repeated. */
const MIN_INTERVAL_MS = 4 * MINUTE_MS;
/** Forced runs (cron, catch-up) only wait out a run that may still be going. */
const FORCED_MIN_INTERVAL_MS = MINUTE_MS;
/** Re-read every open ticket's invoice this often, in case the change feed missed a payment. */
const OPEN_TICKET_REFRESH_MS = 6 * 60 * MINUTE_MS;
const FIRST_RUN_LOOKBACK_MS = 2 * DAY_MS;
const YELP_MIN_LOOKBACK_DAYS = 2;
const YELP_MAX_LOOKBACK_DAYS = 14;
/** Leaves the Yelp pass room to finish inside a 60 s function. */
const YELP_START_DEADLINE_MS = 35_000;
/** Estimate PDFs downloaded per run for the Gmail deposit-request check (about 2 s each). */
const DEPOSIT_CHECK_MAX_PDFS = 4;
const DEPOSIT_CHECK_DEADLINE_MS = 25_000;

export type QuickBooksAutoSyncPass = {
  status: 'ok' | 'not_connected' | 'error';
  estimates: number;
  invoices: number;
  payments: number;
  /** Invoices re-read because a changed payment touched them. */
  paidInvoices: number;
  /** Open tickets whose invoice changed in the periodic re-read; null when it did not run. */
  openInvoicesRefreshed: number | null;
  depositsChecked: number;
  /** Gmail estimate PDFs read for the deposit-request warning. */
  estimateDepositPdfs: number;
  /** Tickets whose deposit-request warning appeared or cleared. */
  estimateDepositChanges: number;
  error?: string;
};

export type YelpAutoSyncPass = {
  status: 'ok' | 'no_gmail' | 'out_of_time' | 'error';
  lookbackDays: number;
  ticketsCreated: number;
  leadEmailsFound: number;
  mailboxErrors: string[];
  error?: string;
};

export type AutoSyncResult = {
  ran: boolean;
  /** True when tickets may have changed, so an open board should refresh. */
  changed: boolean;
  startedAt: string | null;
  quickbooks: QuickBooksAutoSyncPass | null;
  yelp: YelpAutoSyncPass | null;
};

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/** Atomic, so several open tabs (or a tab and the cron) never run overlapping syncs. */
async function claimRun(force: boolean, now: Date): Promise<AutoSyncState | null> {
  try {
    await prisma.autoSyncState.upsert({ where: { id: STATE_ID }, create: { id: STATE_ID }, update: {} });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  const cutoff = new Date(now.getTime() - (force ? FORCED_MIN_INTERVAL_MS : MIN_INTERVAL_MS));
  const { count } = await prisma.autoSyncState.updateMany({
    where: { id: STATE_ID, OR: [{ startedAt: null }, { startedAt: { lt: cutoff } }] },
    data: { startedAt: now },
  });
  return count === 1 ? prisma.autoSyncState.findUnique({ where: { id: STATE_ID } }) : null;
}

/**
 * Each feed is read oldest-first, so a truncated feed was applied up to its newest row. Stopping
 * there (rather than at another feed's newer row) keeps its remaining changes for the next run.
 */
function nextQboWatermark(since: Date, batches: QboChangeBatch<unknown>[]): Date {
  const truncated = batches.filter((b) => b.truncated && b.newestUpdatedAt);
  const candidates = (truncated.length > 0 ? truncated : batches)
    .map((b) => b.newestUpdatedAt)
    .filter((d): d is Date => d != null);
  if (candidates.length === 0) return since;
  const pick = truncated.length > 0 ? Math.min(...candidates.map(Number)) : Math.max(...candidates.map(Number));
  return new Date(Math.max(pick, since.getTime()));
}

/**
 * Re-reads the invoice behind every ticket still on the board and re-applies the ones whose money
 * or status moved. Estimate-only tickets get their customer's deposit re-checked instead.
 */
async function refreshOpenTickets(
  realmId: string,
  applied: Set<string>,
  depositCustomers: Set<string>,
): Promise<number> {
  const open = await prisma.job.findMany({
    where: {
      archivedAt: null,
      OR: [{ quickbooksInvoiceId: { not: null } }, { quickbooksEstimateId: { not: null } }],
    },
    select: {
      quickbooksInvoiceId: true,
      quickbooksCustomerId: true,
      invoiceStatus: true,
      invoiceAmountCents: true,
      amountPaidCents: true,
    },
  });

  const byInvoiceId = new Map<string, (typeof open)[number]>();
  for (const job of open) {
    if (usableQboDocId(job.quickbooksInvoiceId)) byInvoiceId.set(job.quickbooksInvoiceId, job);
    else if (job.quickbooksCustomerId) depositCustomers.add(job.quickbooksCustomerId);
  }

  const ids = [...byInvoiceId.keys()].filter((id) => !applied.has(id));
  let refreshed = 0;
  for (const invoice of await listInvoicesByIds(realmId, ids)) {
    const stored = byInvoiceId.get(invoice.id);
    if (!stored) continue;
    const paid = invoice.balanceKnown === false ? stored.amountPaidCents : invoice.amountPaidCents;
    if (
      stored.invoiceStatus === invoice.status &&
      stored.invoiceAmountCents === invoice.totalAmtCents &&
      stored.amountPaidCents === paid
    ) {
      continue;
    }
    await upsertJobFromInvoice(invoice, { realmId, syncDrive: false });
    applied.add(invoice.id);
    refreshed += 1;
  }
  return refreshed;
}

/**
 * Applies only what changed in QuickBooks since the last run. Re-applying unchanged estimates
 * would undo board moves made in Dash (estimate status drives the Quoted / Approved lanes).
 */
async function syncQuickBooks(
  state: AutoSyncState,
  now: Date,
): Promise<{ pass: QuickBooksAutoSyncPass; qboChangedSince?: Date; invoicesRefreshedAt?: Date }> {
  const pass: QuickBooksAutoSyncPass = {
    status: 'ok',
    estimates: 0,
    invoices: 0,
    payments: 0,
    paidInvoices: 0,
    openInvoicesRefreshed: null,
    depositsChecked: 0,
    estimateDepositPdfs: 0,
    estimateDepositChanges: 0,
  };
  const token = await prisma.quickBooksToken.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, realmId: true, lastTicketSyncAt: true },
  });
  if (!token) return { pass: { ...pass, status: 'not_connected' } };

  const { realmId } = token;
  const since =
    state.qboChangedSince ?? token.lastTicketSyncAt ?? new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);

  try {
    const estimates = await listEstimatesChangedSince(realmId, since);
    const invoices = await listInvoicesChangedSince(realmId, since);
    const payments = await listPaymentsChangedSince(realmId, since);

    for (const estimate of estimates.items) {
      await upsertJobFromEstimate(estimate, { realmId, syncDrive: false });
    }
    const applied = new Set<string>();
    for (const invoice of invoices.items) {
      await upsertJobFromInvoice(invoice, { realmId, syncDrive: false });
      applied.add(invoice.id);
    }

    const paidInvoiceIds = [...new Set(payments.items.flatMap((p) => p.invoiceIds))].filter(
      (id) => !applied.has(id),
    );
    for (const invoice of await listInvoicesByIds(realmId, paidInvoiceIds)) {
      await upsertJobFromInvoice(invoice, { realmId, syncDrive: false });
      applied.add(invoice.id);
      pass.paidInvoices += 1;
    }

    const depositCustomers = new Set(
      payments.items.map((p) => p.customerId).filter((id): id is string => Boolean(id)),
    );

    let invoicesRefreshedAt: Date | undefined;
    const lastRefresh = state.invoicesRefreshedAt?.getTime() ?? 0;
    if (now.getTime() - lastRefresh >= OPEN_TICKET_REFRESH_MS) {
      pass.openInvoicesRefreshed = await refreshOpenTickets(realmId, applied, depositCustomers);
      invoicesRefreshedAt = now;
    }

    for (const customerId of depositCustomers) {
      await persistCustomerDepositCents(realmId, customerId);
    }

    // Invoices are applied first so a just-converted estimate is already off the open list.
    const depositRequests = await refreshDepositChecksAfterSync({
      realmId,
      changedEstimates: estimates.items,
      maxPdfs: DEPOSIT_CHECK_MAX_PDFS,
      deadlineAt: now.getTime() + DEPOSIT_CHECK_DEADLINE_MS,
    }).catch((e) => {
      console.warn('[auto-sync] estimate deposit checks failed', e);
      return { pdfsRead: 0, changed: 0 };
    });

    pass.estimates = estimates.items.length;
    pass.invoices = invoices.items.length;
    pass.payments = payments.items.length;
    pass.depositsChecked = depositCustomers.size;
    pass.estimateDepositPdfs = depositRequests.pdfsRead;
    pass.estimateDepositChanges = depositRequests.changed;

    await prisma.quickBooksToken.update({
      where: { id: token.id },
      data: { lastTicketSyncAt: new Date() },
      select: { id: true },
    });

    return {
      pass,
      qboChangedSince: nextQboWatermark(since, [estimates, invoices, payments]),
      invoicesRefreshedAt,
    };
  } catch (e) {
    return { pass: { ...pass, status: 'error', error: errorText(e) } };
  }
}

async function syncYelp(
  state: AutoSyncState,
  now: Date,
): Promise<{ pass: YelpAutoSyncPass; yelpScannedAt?: Date }> {
  const daysSince = state.yelpScannedAt
    ? (now.getTime() - state.yelpScannedAt.getTime()) / DAY_MS
    : YELP_MAX_LOOKBACK_DAYS;
  const lookbackDays = Math.min(
    YELP_MAX_LOOKBACK_DAYS,
    Math.max(YELP_MIN_LOOKBACK_DAYS, Math.ceil(daysSince) + 1),
  );
  const pass: YelpAutoSyncPass = {
    status: 'ok',
    lookbackDays,
    ticketsCreated: 0,
    leadEmailsFound: 0,
    mailboxErrors: [],
  };

  if ((await prisma.gmailConnection.count()) === 0) return { pass: { ...pass, status: 'no_gmail' } };

  try {
    const result = await scanYelpLeadEmailsAllMailboxes({ lookbackDays, pullYelpBiz: false });
    pass.ticketsCreated = result.counts.ticketsCreated;
    pass.leadEmailsFound = result.counts.leadEmailsFound;
    pass.mailboxErrors = result.mailboxes
      .filter((m) => m.error)
      .map((m) => `${m.mailboxEmail}: ${m.error}`);
    // A mailbox that failed keeps the window open so its leads are picked up once it works again.
    return { pass, yelpScannedAt: pass.mailboxErrors.length === 0 ? now : undefined };
  } catch (e) {
    return { pass: { ...pass, status: 'error', error: errorText(e) } };
  }
}

/**
 * Pulls QuickBooks changes (estimates, invoices, payments, deposits) and new Yelp lead emails
 * into tickets. Runs while Dash is open (components/auto-sync.tsx) and from /api/cron/auto-sync.
 */
export async function runAutoSync(opts: { force?: boolean } = {}): Promise<AutoSyncResult> {
  const started = Date.now();
  const now = new Date(started);
  const state = await claimRun(Boolean(opts.force), now);
  if (!state) return { ran: false, changed: false, startedAt: null, quickbooks: null, yelp: null };

  let qbo: Awaited<ReturnType<typeof syncQuickBooks>> | null = null;
  let yelp: Awaited<ReturnType<typeof syncYelp>> | null = null;
  let crash: string | null = null;
  try {
    qbo = await syncQuickBooks(state, now);
    yelp =
      Date.now() - started < YELP_START_DEADLINE_MS
        ? await syncYelp(state, now)
        : {
            pass: {
              status: 'out_of_time',
              lookbackDays: 0,
              ticketsCreated: 0,
              leadEmailsFound: 0,
              mailboxErrors: [],
            },
          };
  } catch (e) {
    crash = errorText(e);
  }

  const q = qbo?.pass ?? null;
  const qboTouched =
    q != null &&
    q.estimates +
      q.invoices +
      q.paidInvoices +
      (q.openInvoicesRefreshed ?? 0) +
      q.depositsChecked +
      q.estimateDepositChanges >
      0;
  const result: AutoSyncResult = {
    ran: true,
    changed: qboTouched || (yelp?.pass.ticketsCreated ?? 0) > 0,
    startedAt: now.toISOString(),
    quickbooks: q,
    yelp: yelp?.pass ?? null,
  };
  const errors = [crash, q?.error, yelp?.pass.error, ...(yelp?.pass.mailboxErrors ?? [])].filter(Boolean);

  await prisma.autoSyncState.update({
    where: { id: STATE_ID },
    data: {
      finishedAt: new Date(),
      ...(qbo?.qboChangedSince ? { qboChangedSince: qbo.qboChangedSince } : {}),
      ...(qbo?.invoicesRefreshedAt ? { invoicesRefreshedAt: qbo.invoicesRefreshedAt } : {}),
      ...(yelp?.yelpScannedAt ? { yelpScannedAt: yelp.yelpScannedAt } : {}),
      lastResult: result as unknown as Prisma.InputJsonValue,
      lastError: errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null,
    },
  });
  return result;
}

export async function getAutoSyncState(): Promise<AutoSyncState | null> {
  return prisma.autoSyncState.findUnique({ where: { id: STATE_ID } });
}
