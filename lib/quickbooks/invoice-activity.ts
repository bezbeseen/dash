import { quickBooksCompanyJson } from '@/lib/quickbooks/client';
import type { InvoiceActivityEvent, InvoiceActivityTimeline } from '@/lib/quickbooks/types-activity';

function activityTimeMs(ev: InvoiceActivityEvent): number {
  const raw = (ev.at || ev.sortKey || '').trim();
  if (!raw) return 0;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return t;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (m) return Date.parse(`${m[1]}T12:00:00.000Z`);
  return 0;
}

/** Merge estimate + invoice timelines chronologically (titles should already distinguish doc type). */
export function mergeActivityTimelines(parts: InvoiceActivityTimeline[]): InvoiceActivityTimeline {
  if (parts.length === 0) return { events: [], notes: [] };
  const events: InvoiceActivityEvent[] = [];
  const notes = new Set<string>();
  for (const p of parts) {
    events.push(...p.events);
    for (const n of p.notes ?? []) notes.add(n);
  }
  events.sort((a, b) => activityTimeMs(a) - activityTimeMs(b) || a.sortKey.localeCompare(b.sortKey));
  return { events, notes: [...notes] };
}

function moneyToCents(amt: string | number | undefined): number {
  if (amt == null) return 0;
  if (typeof amt === 'number') {
    if (Number.isNaN(amt)) return 0;
    return Math.round(amt * 100);
  }
  const s = String(amt)
    .replace(/[$,\s]/g, '')
    .trim();
  if (!s) return 0;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

type QboRef = { value?: string; name?: string };
type QboLinkedTxn = { TxnId?: string; TxnType?: string };
type QboMeta = { CreateTime?: string; LastUpdatedTime?: string };

type QboEstimateRaw = {
  Id?: string;
  TxnStatus?: string;
  TxnDate?: string;
  TotalAmt?: number | string;
  DocNumber?: string;
  EmailStatus?: string;
  MetaData?: QboMeta;
};

type QboInvoiceRaw = {
  Id?: string;
  TxnDate?: string;
  EmailStatus?: string;
  MetaData?: QboMeta;
  LinkedTxn?: QboLinkedTxn[];
};

type QboPayment = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number | string;
  PaymentRefNum?: string;
  PaymentMethodRef?: QboRef;
  DepositToAccountRef?: QboRef;
  PrivateNote?: string;
  MetaData?: QboMeta;
  LinkedTxn?: QboLinkedTxn[];
  CreditCardPayment?: {
    CreditChargeInfo?: { Number?: string; Type?: string; NameOnAcct?: string };
  };
  Line?: Array<{ Amount?: number | string; LinkedTxn?: QboLinkedTxn[] }>;
};

type QboDeposit = {
  Id?: string;
  TxnDate?: string;
  MetaData?: QboMeta;
  DepositToAccountRef?: QboRef;
  Line?: Array<{ LinkedTxn?: QboLinkedTxn[] }>;
};

function sortIsoFromTxnDate(txnDate: string | undefined, fallback?: string): string {
  if (txnDate?.trim()) {
    const d = txnDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
    return d.includes('T') ? d : `${d}T12:00:00.000Z`;
  }
  return fallback || new Date(0).toISOString();
}

function paymentInstrumentLabel(pay: QboPayment): string | undefined {
  const num = pay.CreditCardPayment?.CreditChargeInfo?.Number?.trim();
  const typ = pay.CreditCardPayment?.CreditChargeInfo?.Type?.trim();
  if (num && typ) return `${typ} *${num}`;
  if (num) return `Card *${num}`;
  const pm = pay.PaymentMethodRef?.name?.trim() || pay.PaymentMethodRef?.value?.trim();
  return pm || undefined;
}

function amountAppliedToInvoice(pay: QboPayment, invoiceId: string): number {
  const lines = pay.Line || [];
  let sum = 0;
  for (const line of lines) {
    const hit = (line.LinkedTxn || []).some(
      (l) =>
        String(l.TxnType || '').toLowerCase() === 'invoice' && String(l.TxnId) === String(invoiceId),
    );
    if (hit) sum += moneyToCents(line.Amount);
  }
  if (sum > 0) return sum;
  return moneyToCents(pay.TotalAmt);
}

/**
 * Build a payment / deposit style timeline from QBO entities linked to an invoice.
 * “Viewed”, exact email open times, etc. are not available on the public API.
 */
export async function fetchInvoiceActivityTimeline(
  realmId: string,
  invoiceId: string,
): Promise<InvoiceActivityTimeline> {
  const notes: string[] = [
    'QuickBooks does not expose the full invoice audit trail in the API (e.g. “viewed” counts, exact send timestamps). Open QuickBooks Online for the complete activity list.',
  ];

  const body = await quickBooksCompanyJson(realmId, `invoice/${encodeURIComponent(invoiceId)}`);
  const inv = (body as { Invoice?: QboInvoiceRaw }).Invoice;
  if (!inv?.Id) {
    return { events: [], notes: ['Invoice not found in QuickBooks.'] };
  }

  const events: InvoiceActivityEvent[] = [];

  if (inv.MetaData?.CreateTime) {
    events.push({
      sortKey: inv.MetaData.CreateTime,
      title: 'Invoice — Opened',
      at: inv.MetaData.CreateTime,
    });
  }

  if (inv.TxnDate) {
    events.push({
      sortKey: sortIsoFromTxnDate(inv.TxnDate, inv.MetaData?.CreateTime),
      title: 'Invoice — Invoice date',
      at: inv.TxnDate,
    });
  }

  const emailSt = (inv.EmailStatus || '').toLowerCase();
  if (emailSt === 'emailsent' || emailSt === 'sent') {
    events.push({
      sortKey: inv.MetaData?.LastUpdatedTime || inv.MetaData?.CreateTime || sortIsoFromTxnDate(inv.TxnDate),
      title: 'Invoice — Sent (email)',
      at: inv.MetaData?.LastUpdatedTime || inv.MetaData?.CreateTime,
      detail: `Email status in QBO: ${inv.EmailStatus}`,
      meta: inv.MetaData?.LastUpdatedTime
        ? `Last metadata update in QBO ${inv.MetaData.LastUpdatedTime}`
        : undefined,
    });
  }

  const paymentLinks = (inv.LinkedTxn || []).filter(
    (t) => String(t.TxnType || '').toLowerCase() === 'payment' && t.TxnId,
  );

  const seenDeposits = new Set<string>();

  for (const lt of paymentLinks) {
    const pid = lt.TxnId as string;
    try {
      const pb = await quickBooksCompanyJson(realmId, `payment/${encodeURIComponent(pid)}`);
      const pay = (pb as { Payment?: QboPayment }).Payment;
      if (!pay?.Id) continue;

      const applied = amountAppliedToInvoice(pay, inv.Id);
      const when = sortIsoFromTxnDate(pay.TxnDate, pay.MetaData?.CreateTime);
      const instrument = paymentInstrumentLabel(pay);
      const ref = pay.PaymentRefNum?.trim() || pay.Id;

      events.push({
        sortKey: when,
        title: 'Invoice — Payment received',
        detail: [instrument, ref ? `Ref ${ref}` : null, `Payment #${pay.Id}`].filter(Boolean).join(' · '),
        amountCents: applied > 0 ? applied : moneyToCents(pay.TotalAmt),
        meta: pay.DepositToAccountRef?.name
          ? `Deposit to: ${pay.DepositToAccountRef.name}`
          : undefined,
      });

      const depositIds = new Set<string>();
      for (const dlt of pay.LinkedTxn || []) {
        if (String(dlt.TxnType || '').toLowerCase() === 'deposit' && dlt.TxnId) {
          depositIds.add(dlt.TxnId);
        }
      }
      for (const line of pay.Line || []) {
        for (const dlt of line.LinkedTxn || []) {
          if (String(dlt.TxnType || '').toLowerCase() === 'deposit' && dlt.TxnId) {
            depositIds.add(dlt.TxnId);
          }
        }
      }

      for (const depId of depositIds) {
        if (seenDeposits.has(depId)) continue;
        seenDeposits.add(depId);
        try {
          const db = await quickBooksCompanyJson(realmId, `deposit/${encodeURIComponent(depId)}`);
          const dep = (db as { Deposit?: QboDeposit }).Deposit;
          if (!dep?.Id) continue;
          const depWhen = sortIsoFromTxnDate(dep.TxnDate, dep.MetaData?.CreateTime);
          const acct = dep.DepositToAccountRef?.name || dep.DepositToAccountRef?.value;
          events.push({
            sortKey: depWhen,
            title: 'Invoice — Payment deposited',
            at: dep.TxnDate || dep.MetaData?.CreateTime,
            detail: [acct || 'Bank deposit', `View deposit #${dep.Id}`, `From payment #${pay.Id}`]
              .filter(Boolean)
              .join(' · '),
            amountCents: applied > 0 ? applied : moneyToCents(pay.TotalAmt),
          });
        } catch {
          events.push({
            sortKey: `${when}Z-deposit-${depId}`,
            title: 'Invoice — Deposit (linked)',
            detail: `Deposit #${depId} — open QuickBooks for details`,
            meta: `Payment #${pay.Id}`,
          });
        }
      }
    } catch {
      events.push({
        sortKey: `payment-${pid}`,
        title: 'Invoice — Payment (linked)',
        detail: `Payment #${pid} — could not load details from QuickBooks`,
      });
    }
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return { events, notes };
}

export async function fetchEstimateActivityTimeline(
  realmId: string,
  estimateId: string,
): Promise<InvoiceActivityTimeline> {
  const notes: string[] = [
    'QuickBooks does not expose full estimate audit history in the API (only current metadata and status). Open QuickBooks Online for the complete activity list.',
  ];

  const body = await quickBooksCompanyJson(realmId, `estimate/${encodeURIComponent(estimateId)}`);
  const est = (body as { Estimate?: QboEstimateRaw }).Estimate;
  if (!est?.Id) {
    return { events: [], notes: ['Estimate not found in QuickBooks.'] };
  }

  const events: InvoiceActivityEvent[] = [];

  if (est.MetaData?.CreateTime) {
    events.push({
      sortKey: est.MetaData.CreateTime,
      title: 'Estimate — Opened',
      at: est.MetaData.CreateTime,
    });
  }

  if (est.TxnDate) {
    events.push({
      sortKey: sortIsoFromTxnDate(est.TxnDate, est.MetaData?.CreateTime),
      title: 'Estimate — Quote date',
      at: est.TxnDate,
    });
  }

  const emailSt = (est.EmailStatus || '').toLowerCase();
  if (emailSt === 'emailsent' || emailSt === 'sent') {
    events.push({
      sortKey: est.MetaData?.LastUpdatedTime || est.MetaData?.CreateTime || sortIsoFromTxnDate(est.TxnDate),
      title: 'Estimate — Sent (email)',
      at: est.MetaData?.LastUpdatedTime || est.MetaData?.CreateTime,
      detail: `Email status in QBO: ${est.EmailStatus}`,
      meta: est.MetaData?.LastUpdatedTime
        ? `Last metadata update in QBO ${est.MetaData.LastUpdatedTime}`
        : undefined,
    });
  }

  const st = (est.TxnStatus || '').trim();
  if (st) {
    events.push({
      sortKey: `${est.MetaData?.LastUpdatedTime || sortIsoFromTxnDate(est.TxnDate, est.MetaData?.CreateTime)}-est-status`,
      title: 'Estimate — Status',
      at: est.MetaData?.LastUpdatedTime,
      detail: `Current status in QBO: ${st}`,
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return { events, notes };
}

export function isSyntheticQuickBooksId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith('csv-') || id.startsWith('demo-');
}
