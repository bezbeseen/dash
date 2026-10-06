import crypto from 'crypto';
import { getQuickBooksApiBase } from '@/lib/quickbooks/config';
import { getValidQuickBooksAccessToken } from '@/lib/quickbooks/tokens-db';
import { BankAccountBalance, EstimateSnapshot, InvoiceSnapshot } from './types';
import { parseAccountListBalances } from './account-list-balances';
import { parseBalanceSheetBankBalances } from './balance-sheet-banks';
import { customerDepositCentsFromPayments, type QboPaymentForDeposit } from './payment-deposits';

export function verifyQuickBooksSignature(rawBody: string, signatureHeader: string | null) {
  const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER;
  if (!verifierToken || !signatureHeader) return false;

  const digest = crypto.createHmac('sha256', verifierToken).update(rawBody).digest('base64');
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signatureHeader);

  if (expected.length !== actual.length) return false;

  return crypto.timingSafeEqual(expected, actual);
}

function dollarsToCents(amt: string | number | undefined): number {
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

function mapEstimateTxnStatus(txnStatus?: string): EstimateSnapshot['status'] {
  switch ((txnStatus || '').toLowerCase()) {
    case 'pending':
      return 'SENT';
    case 'accepted':
    case 'closed':
    case 'converted':
      return 'ACCEPTED';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'UNKNOWN';
  }
}

type QboRef = { value?: string; name?: string };

type QboMeta = { CreateTime?: string; LastUpdatedTime?: string };

type QboEstimate = {
  Id?: string;
  TxnStatus?: string;
  TxnDate?: string;
  TotalAmt?: number | string;
  DocNumber?: string;
  CustomerRef?: QboRef;
  /** QBO may return a string or `{ value: "..." }`. */
  CustomerMemo?: string | { value?: string; Value?: string };
  Line?: unknown[];
  MetaData?: QboMeta;
};

type QboLinkedTxn = { TxnId?: string; TxnType?: string };

type QboEmailAddr = { Address?: string };

type QboInvoice = {
  Id?: string;
  TotalAmt?: number | string;
  Balance?: number | string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  CustomerRef?: QboRef;
  LinkedTxn?: QboLinkedTxn[];
  BillEmail?: QboEmailAddr;
  BillEmailCc?: QboEmailAddr;
  CustomerMemo?: string | { value?: string; Value?: string };
  PrivateNote?: string;
  Line?: unknown[];
  MetaData?: QboMeta;
};

const QBO_DESC_MAX = 2000;

function qboStringishMemo(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const v = o.value ?? o.Value;
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

function clip(s: string): string {
  return s.length > QBO_DESC_MAX ? s.slice(0, QBO_DESC_MAX) : s;
}

function qboLineHumanText(line: unknown): string | undefined {
  if (!line || typeof line !== 'object') return undefined;
  const o = line as Record<string, unknown>;
  const dt = String(o.DetailType || '');
  if (dt === 'SubTotalLineDetail' || dt === 'DiscountLineDetail') return undefined;

  const d = typeof o.Description === 'string' ? o.Description.trim() : '';
  if (d) return clip(d);

  const sid = o.SalesItemLineDetail as { ItemRef?: { name?: string } } | undefined;
  const itemName = sid?.ItemRef?.name?.trim();
  if (itemName) return clip(itemName);

  if (dt === 'GroupLineDetail') {
    const g = o.GroupLineDetail as { Line?: unknown[] } | undefined;
    const nested = qboFirstLineDescription(g?.Line);
    if (nested) return nested;
  }

  return undefined;
}

function qboFirstLineDescription(lines: unknown): string | undefined {
  if (!Array.isArray(lines)) return undefined;
  for (const line of lines) {
    const text = qboLineHumanText(line);
    if (text) return text;
  }
  return undefined;
}

function estimateProjectDescription(e: QboEstimate): string | undefined {
  const memo = qboStringishMemo(e.CustomerMemo as unknown);
  if (memo) return clip(memo);
  const fromLine = qboFirstLineDescription(e.Line);
  return fromLine;
}

function invoiceProjectDescription(inv: QboInvoice): string | undefined {
  const memo = qboStringishMemo(inv.CustomerMemo as unknown) || (inv.PrivateNote?.trim() ?? '');
  if (memo) return clip(memo);
  return qboFirstLineDescription(inv.Line);
}

export async function quickBooksCompanyJson(realmId: string, path: string): Promise<unknown> {
  const token = await getValidQuickBooksAccessToken(realmId);
  const base = getQuickBooksApiBase();
  const url = `${base}/v3/company/${encodeURIComponent(realmId)}/${path}${path.includes('?') ? '&' : '?'}minorversion=65`;

  const retryable = new Set([429, 502, 503, 504]);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 800));
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`QuickBooks API ${res.status} for ${path}: ${text.slice(0, 500)}`);
      if (retryable.has(res.status) && attempt < 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.Fault) {
        throw new Error(`QuickBooks Fault: ${JSON.stringify(parsed.Fault)}`);
      }
      return parsed;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('QuickBooks Fault')) throw e;
      throw new Error(`QuickBooks API returned non-JSON for ${path}`);
    }
  }

  throw lastError ?? new Error(`QuickBooks API failed for ${path}`);
}

/** POST JSON to QBO (create Customer / Estimate). */
export async function quickBooksCompanyJsonPost(
  realmId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const token = await getValidQuickBooksAccessToken(realmId);
  const base = getQuickBooksApiBase();
  const url = `${base}/v3/company/${encodeURIComponent(realmId)}/${path}${path.includes('?') ? '&' : '?'}minorversion=65`;

  const retryable = new Set([429, 502, 503, 504]);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 800));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`QuickBooks API ${res.status} POST ${path}: ${text.slice(0, 800)}`);
      if (retryable.has(res.status) && attempt < 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.Fault) {
        throw new Error(`QuickBooks Fault: ${JSON.stringify(parsed.Fault)}`);
      }
      return parsed;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('QuickBooks Fault')) throw e;
      throw new Error(`QuickBooks API returned non-JSON for POST ${path}`);
    }
  }

  throw lastError ?? new Error(`QuickBooks API POST failed for ${path}`);
}

/** Profit & Loss for a date range (month-to-date, quarter, etc.). */
export async function fetchProfitAndLossReport(
  realmId: string,
  startDateYmd: string,
  endDateYmd: string,
  opts?: { accountingMethod?: 'Accrual' | 'Cash' },
): Promise<unknown> {
  const method = opts?.accountingMethod ?? 'Accrual';
  const q = new URLSearchParams({
    start_date: startDateYmd,
    end_date: endDateYmd,
    accounting_method: method,
  });
  return quickBooksCompanyJson(realmId, `reports/ProfitAndLoss?${q.toString()}`);
}

function estimateFromQbo(e: QboEstimate, fallbackId: string): EstimateSnapshot {
  const id = e.Id ?? fallbackId;
  const customerName = e.CustomerRef?.name?.trim() || `Customer ${e.CustomerRef?.value ?? 'unknown'}`;
  const projectName = e.DocNumber?.trim() ? `Estimate #${e.DocNumber}` : `Estimate #${id}`;
  const projectDescription = estimateProjectDescription(e);

  return {
    id,
    customerId: e.CustomerRef?.value,
    customerName,
    projectName,
    docNumber: e.DocNumber?.trim() || undefined,
    projectDescription,
    totalAmtCents: dollarsToCents(e.TotalAmt),
    status: mapEstimateTxnStatus(e.TxnStatus),
    txnDate: e.TxnDate,
    metaCreateTime: e.MetaData?.CreateTime,
  };
}

function invoiceFromQbo(inv: QboInvoice, fallbackId: string): InvoiceSnapshot {
  const id = inv.Id ?? fallbackId;
  const totalCents = dollarsToCents(inv.TotalAmt);
  const balRaw = inv.Balance;
  // Balance must be a plain number/string — sometimes other fields come back oddly shaped.
  const balanceKnown =
    balRaw != null &&
    (typeof balRaw === 'number' || typeof balRaw === 'string') &&
    String(balRaw).trim().length > 0;
  let balanceCents = balanceKnown ? dollarsToCents(balRaw) : 0;
  let amountPaidCents =
    balanceKnown && totalCents >= 0 ? Math.max(0, totalCents - balanceCents) : 0;

  let status: InvoiceSnapshot['status'] = 'OPEN';
  if (balanceKnown && balanceCents === 0 && totalCents > 0) {
    status = 'PAID';
  } else if (totalCents === 0 && (!balanceKnown || balanceCents === 0)) {
    status = 'DRAFT';
  }

  // QBO sometimes leaves a 1–2¢ open balance on fully paid invoices (tax/rounding). Treat as paid.
  if (
    balanceKnown &&
    totalCents > 0 &&
    balanceCents > 0 &&
    balanceCents <= 2 &&
    amountPaidCents >= totalCents - 2
  ) {
    status = 'PAID';
    balanceCents = 0;
    amountPaidCents = totalCents;
  }

  const linked = inv.LinkedTxn?.find(
    (t) => String(t.TxnType || '').toLowerCase() === 'estimate' && t.TxnId
  );
  const customerName = inv.CustomerRef?.name?.trim() || `Customer ${inv.CustomerRef?.value ?? 'unknown'}`;
  const customerMemoRaw = qboStringishMemo(inv.CustomerMemo as unknown);
  const customerMemo = customerMemoRaw || undefined;
  const privateNote = inv.PrivateNote?.trim() || undefined;
  const projectDescription = invoiceProjectDescription(inv);

  return {
    id,
    linkedEstimateId: linked?.TxnId,
    customerId: inv.CustomerRef?.value,
    customerName,
    totalAmtCents: totalCents,
    balanceCents,
    amountPaidCents,
    balanceKnown,
    status,
    docNumber: inv.DocNumber?.trim() || undefined,
    txnDate: inv.TxnDate,
    dueDate: inv.DueDate,
    billEmail: inv.BillEmail?.Address?.trim() || undefined,
    billEmailCc: inv.BillEmailCc?.Address?.trim() || undefined,
    customerMemo,
    privateNote,
    projectDescription,
    metaCreateTime: inv.MetaData?.CreateTime,
  };
}

export async function fetchEstimateById(realmId: string, estimateId: string): Promise<EstimateSnapshot> {
  const body = await quickBooksCompanyJson(realmId, `estimate/${encodeURIComponent(estimateId)}`);
  const est = (body as { Estimate?: QboEstimate }).Estimate;
  if (!est) {
    throw new Error('QuickBooks response missing Estimate object');
  }
  return estimateFromQbo(est, estimateId);
}

export async function fetchInvoiceById(realmId: string, invoiceId: string): Promise<InvoiceSnapshot> {
  const body = await quickBooksCompanyJson(realmId, `invoice/${encodeURIComponent(invoiceId)}`);
  const inv = (body as { Invoice?: QboInvoice }).Invoice;
  if (!inv) {
    throw new Error('QuickBooks response missing Invoice object');
  }
  return invoiceFromQbo(inv, invoiceId);
}

type QboPaymentEntity = {
  Id?: string;
  CustomerRef?: QboRef;
  LinkedTxn?: QboLinkedTxn[];
  Line?: Array<{ LinkedTxn?: QboLinkedTxn[] }>;
};

function collectInvoiceIdsFromPayment(pay: QboPaymentEntity): string[] {
  const ids = new Set<string>();
  const consider = (links: QboLinkedTxn[] | undefined) => {
    for (const lt of links || []) {
      if (String(lt.TxnType || '').toLowerCase() === 'invoice' && lt.TxnId) {
        ids.add(String(lt.TxnId));
      }
    }
  };
  consider(pay.LinkedTxn);
  for (const line of pay.Line || []) consider(line.LinkedTxn);
  return [...ids];
}

async function fetchPaymentEntity(realmId: string, paymentId: string): Promise<QboPaymentEntity | null> {
  const body = await quickBooksCompanyJson(realmId, `payment/${encodeURIComponent(paymentId)}`);
  const pay = (body as { Payment?: QboPaymentEntity }).Payment;
  return pay?.Id ? pay : null;
}

/** Invoice ids a QBO Payment is applied to (webhook Payment entities do not include the Invoice itself). */
export async function fetchInvoiceIdsLinkedToPayment(
  realmId: string,
  paymentId: string,
): Promise<string[]> {
  const pay = await fetchPaymentEntity(realmId, paymentId);
  if (!pay) return [];
  return collectInvoiceIdsFromPayment(pay);
}

export async function fetchPaymentCustomerId(realmId: string, paymentId: string): Promise<string | null> {
  const pay = await fetchPaymentEntity(realmId, paymentId);
  const id = pay?.CustomerRef?.value?.trim();
  return id || null;
}

type QboPhone = { FreeFormNumber?: string };
type QboAddr = {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
};
type QboCustomerEntity = {
  Id?: string;
  DisplayName?: string;
  PrimaryEmailAddr?: QboEmailAddr;
  PrimaryPhone?: QboPhone;
  Mobile?: QboPhone;
  Balance?: number | string;
  BillAddr?: QboAddr;
};

export type QboCustomerContact = {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  balanceCents: number | null;
  billAddress: string | null;
};

function formatQboBillAddress(addr: QboAddr | undefined): string | null {
  if (!addr) return null;
  const street = [addr.Line1, addr.Line2].map((s) => s?.trim()).filter(Boolean).join(', ');
  const cityLine = [addr.City, addr.CountrySubDivisionCode, addr.PostalCode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
  const parts = [street, cityLine].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** One QBO GET: DisplayName, PrimaryEmailAddr, phone, bill address, open balance. */
export async function fetchQboCustomerContact(
  realmId: string,
  customerId: string,
): Promise<QboCustomerContact | null> {
  const body = await quickBooksCompanyJson(realmId, `customer/${encodeURIComponent(customerId)}`);
  const c = (body as { Customer?: QboCustomerEntity }).Customer;
  if (!c?.Id) return null;
  const email = c.PrimaryEmailAddr?.Address?.trim() || null;
  const phone = c.PrimaryPhone?.FreeFormNumber?.trim() || c.Mobile?.FreeFormNumber?.trim() || null;
  return {
    id: c.Id,
    displayName: c.DisplayName?.trim() || null,
    email,
    phone,
    balanceCents: c.Balance == null ? null : dollarsToCents(c.Balance),
    billAddress: formatQboBillAddress(c.BillAddr),
  };
}

/** Customer's PrimaryEmailAddr — the shop's usual "email this customer" address. */
export async function fetchCustomerPrimaryEmail(realmId: string, customerId: string): Promise<string | null> {
  const contact = await fetchQboCustomerContact(realmId, customerId);
  return contact?.email ?? null;
}

/**
 * Money this customer paid that no invoice has absorbed yet (QBO estimate deposits / unused
 * credits). Paginates; see `customerDepositCentsFromPayments` for how applied deposits drop out.
 */
export async function fetchCustomerUnappliedPaymentCents(
  realmId: string,
  customerId: string,
): Promise<number> {
  const lit = qboQuerySqlStringLiteral(customerId);
  let start = 1;
  const payments: QboPaymentForDeposit[] = [];
  for (let page = 0; page < 8; page++) {
    // SELECT * so PaymentExtendedType and Line come back; one customer's payments are few.
    const sql = `SELECT * FROM Payment WHERE CustomerRef = '${lit}' STARTPOSITION ${start} MAXRESULTS 100`;
    const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
    const rows = qboQueryEntities<QboPaymentForDeposit>(
      body as { QueryResponse?: Record<string, unknown> },
      'Payment',
    );
    if (rows.length === 0) break;
    payments.push(...rows);
    if (rows.length < 100) break;
    start += rows.length;
  }
  return customerDepositCentsFromPayments(payments);
}

/** QBO returns raw PDF bytes (not JSON). */
export async function fetchInvoicePdf(realmId: string, invoiceId: string): Promise<ArrayBuffer> {
  const token = await getValidQuickBooksAccessToken(realmId);
  const base = getQuickBooksApiBase();
  const url = `${_basePdfUrl(base, realmId)}/invoice/${encodeURIComponent(invoiceId)}/pdf?minorversion=65`;
  return _fetchQboPdf(url, token);
}

export async function fetchEstimatePdf(realmId: string, estimateId: string): Promise<ArrayBuffer> {
  const token = await getValidQuickBooksAccessToken(realmId);
  const base = getQuickBooksApiBase();
  const url = `${_basePdfUrl(base, realmId)}/estimate/${encodeURIComponent(estimateId)}/pdf?minorversion=65`;
  return _fetchQboPdf(url, token);
}

function _basePdfUrl(base: string, realmId: string) {
  return `${base}/v3/company/${encodeURIComponent(realmId)}`;
}

async function _fetchQboPdf(url: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf',
    },
  });
  const buf = await res.arrayBuffer();
  if (!res.ok) {
    let extra = '';
    try {
      const text = new TextDecoder().decode(buf.slice(0, 500));
      if (text.trim().startsWith('{')) extra = `: ${text}`;
    } catch {
      /* ignore */
    }
    throw new Error(`QuickBooks PDF error ${res.status}${extra}`);
  }
  return buf;
}

function qboQueryEntities<T>(qr: { QueryResponse?: Record<string, unknown> } | undefined, key: string): T[] {
  const raw = qr?.QueryResponse?.[key];
  if (raw == null) return [];
  return Array.isArray(raw) ? (raw as T[]) : [raw as T];
}

export function qboQuerySqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeInvoiceDocNumberInput(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('#')) s = s.slice(1).trim();
  return s;
}

/**
 * Query by DocNumber, then GET full invoice — two QBO calls total (on-demand; no extra polling).
 */
export async function fetchInvoiceByDocNumber(realmId: string, docNumberRaw: string): Promise<InvoiceSnapshot | null> {
  const docNumber = normalizeInvoiceDocNumberInput(docNumberRaw);
  if (!docNumber) return null;

  const lit = qboQuerySqlStringLiteral(docNumber);
  const sql = `SELECT Id FROM Invoice WHERE DocNumber = '${lit}' MAXRESULTS 5`;
  const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
  const stubs = qboQueryEntities<QboInvoice>(body as { QueryResponse?: Record<string, unknown> }, 'Invoice');
  const ids = [...new Set(stubs.map((s) => s.Id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return null;
  if (ids.length > 1) {
    console.warn('[quickbooks] multiple Invoice Ids for DocNumber; using first', docNumber, ids);
  }
  return fetchInvoiceById(realmId, ids[0]!);
}

// Avoid SELECT * on estimates: line items on many of them can make QBO stream-timeout (504).
const ESTIMATE_QUERY_FIELDS = 'Id, TxnStatus, TxnDate, TotalAmt, DocNumber, CustomerRef, CustomerMemo, MetaData';
// Query rejects the whole statement on an unknown property (BillEmailCc is GET-only).
const INVOICE_QUERY_FIELDS =
  'Id, DocNumber, TotalAmt, Balance, TxnDate, DueDate, CustomerRef, BillEmail, CustomerMemo, PrivateNote, LinkedTxn, MetaData';

/** Pull recent estimates from QuickBooks (sandbox or prod per env). */
export async function listRecentEstimates(realmId: string, maxResults = 100): Promise<EstimateSnapshot[]> {
  const sql = `SELECT ${ESTIMATE_QUERY_FIELDS} FROM Estimate ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${maxResults}`;
  let body: unknown;
  try {
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
  } catch {
    const fallback = `SELECT Id FROM Estimate ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${maxResults}`;
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(fallback)}`);
    const stubs = qboQueryEntities<QboEstimate>(body as { QueryResponse?: Record<string, unknown> }, 'Estimate');
    const ids = [...new Set(stubs.map((s) => s.Id).filter((id): id is string => Boolean(id)))];
    const hydrateCap = Math.min(ids.length, 8);
    const results = await mapInBatches(ids.slice(0, hydrateCap), 3, async (id) => {
      try {
        return await fetchEstimateById(realmId, id);
      } catch (e) {
        console.warn('[quickbooks] listRecentEstimates: GET estimate failed, skipping id', id, e);
        return null;
      }
    });
    return results.filter((x): x is EstimateSnapshot => x != null);
  }
  const estimates = qboQueryEntities<QboEstimate>(body as { QueryResponse?: Record<string, unknown> }, 'Estimate');
  return estimates.map((e) => estimateFromQbo(e, e.Id ?? ''));
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    out.push(...chunkResults);
  }
  return out;
}

/** QBO Query often omits Balance; without it we must not treat the invoice as unpaid. */
function qboInvoiceBalancePresent(inv: QboInvoice): boolean {
  const balRaw = inv.Balance;
  return (
    balRaw != null &&
    (typeof balRaw === 'number' || typeof balRaw === 'string') &&
    String(balRaw).trim().length > 0
  );
}

/**
 * List recent invoices. Prefer one Query (Balance + LinkedTxn) for speed, but GET any row
 * where Balance is missing — otherwise sync writes amountPaidCents=0 and paid jobs look unpaid.
 */
export async function listRecentInvoices(realmId: string, maxResults = 100): Promise<InvoiceSnapshot[]> {
  let queryRows: QboInvoice[] | null = null;
  const richSql = `SELECT ${INVOICE_QUERY_FIELDS} FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${maxResults}`;
  try {
    const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(richSql)}`);
    queryRows = qboQueryEntities<QboInvoice>(body as { QueryResponse?: Record<string, unknown> }, 'Invoice');
  } catch (richErr) {
    console.warn('[quickbooks] listRecentInvoices rich query failed; falling back to GET-by-id', richErr);
  }

  let stubs = queryRows;
  if (!stubs) {
    const ordered = `SELECT Id FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${maxResults}`;
    let body: unknown;
    try {
      body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(ordered)}`);
    } catch {
      const fallback = `SELECT Id FROM Invoice MAXRESULTS ${maxResults}`;
      body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(fallback)}`);
    }
    stubs = qboQueryEntities<QboInvoice>(body as { QueryResponse?: Record<string, unknown> }, 'Invoice');
  }

  return invoiceSnapshotsFromRows(realmId, stubs, { rowsHaveFields: queryRows != null });
}

/**
 * Trust a query row only when Balance is present; otherwise GET the full invoice. A failed GET
 * is skipped rather than invented unpaid, so a previously correct amountPaidCents survives.
 */
async function invoiceSnapshotsFromRows(
  realmId: string,
  rows: QboInvoice[],
  opts: { rowsHaveFields: boolean },
): Promise<InvoiceSnapshot[]> {
  const results = await mapInBatches(rows, 3, async (inv) => {
    const id = inv.Id?.trim();
    if (!id) return null;

    if (opts.rowsHaveFields && qboInvoiceBalancePresent(inv)) {
      return invoiceFromQbo(inv, id);
    }

    try {
      return await fetchInvoiceById(realmId, id);
    } catch (e) {
      console.warn('[quickbooks] invoice GET failed, skipping id', id, e);
      return null;
    }
  });

  return results.filter((x): x is InvoiceSnapshot => x != null);
}

const CHANGE_PAGE_SIZE = 100;

/** QBO query datetime literal: whole seconds with an explicit offset. */
function qboDateTimeLiteral(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function newestLastUpdated(rows: Array<{ MetaData?: QboMeta }>): Date | null {
  let newest: Date | null = null;
  for (const row of rows) {
    const raw = row.MetaData?.LastUpdatedTime;
    const t = raw ? new Date(raw) : null;
    if (t && !Number.isNaN(t.getTime()) && (!newest || t > newest)) newest = t;
  }
  return newest;
}

export type QboChangeBatch<T> = {
  items: T[];
  /** Newest MetaData.LastUpdatedTime in the batch; the next run asks for changes after it. */
  newestUpdatedAt: Date | null;
  /** More changes than one page. Oldest-first order means the next run picks up the rest. */
  truncated: boolean;
};

async function queryChangedSince<T>(
  realmId: string,
  entity: 'Estimate' | 'Invoice' | 'Payment',
  fields: string,
  since: Date,
): Promise<{ rows: T[]; truncated: boolean }> {
  const sql = `SELECT ${fields} FROM ${entity} WHERE MetaData.LastUpdatedTime > '${qboDateTimeLiteral(since)}' ORDERBY MetaData.LastUpdatedTime ASC MAXRESULTS ${CHANGE_PAGE_SIZE}`;
  const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
  const rows = qboQueryEntities<T>(body as { QueryResponse?: Record<string, unknown> }, entity);
  return { rows, truncated: rows.length >= CHANGE_PAGE_SIZE };
}

/** Estimates edited in QuickBooks after `since`. */
export async function listEstimatesChangedSince(
  realmId: string,
  since: Date,
): Promise<QboChangeBatch<EstimateSnapshot>> {
  const { rows, truncated } = await queryChangedSince<QboEstimate>(realmId, 'Estimate', ESTIMATE_QUERY_FIELDS, since);
  return {
    items: rows.filter((e) => e.Id).map((e) => estimateFromQbo(e, e.Id!)),
    newestUpdatedAt: newestLastUpdated(rows),
    truncated,
  };
}

/** Invoices edited in QuickBooks after `since` (receiving a payment updates the invoice too). */
export async function listInvoicesChangedSince(
  realmId: string,
  since: Date,
): Promise<QboChangeBatch<InvoiceSnapshot>> {
  const { rows, truncated } = await queryChangedSince<QboInvoice>(realmId, 'Invoice', INVOICE_QUERY_FIELDS, since);
  return {
    items: await invoiceSnapshotsFromRows(realmId, rows, { rowsHaveFields: true }),
    newestUpdatedAt: newestLastUpdated(rows),
    truncated,
  };
}

export type QboPaymentChange = {
  id: string;
  customerId: string | null;
  invoiceIds: string[];
};

/** Payments recorded or edited after `since`, with the invoices each one is applied to. */
export async function listPaymentsChangedSince(
  realmId: string,
  since: Date,
): Promise<QboChangeBatch<QboPaymentChange>> {
  const { rows, truncated } = await queryChangedSince<QboPaymentEntity & { MetaData?: QboMeta }>(
    realmId,
    'Payment',
    '*',
    since,
  );
  return {
    items: rows
      .filter((p) => p.Id)
      .map((p) => ({
        id: p.Id!,
        customerId: p.CustomerRef?.value?.trim() || null,
        invoiceIds: collectInvoiceIdsFromPayment(p),
      })),
    newestUpdatedAt: newestLastUpdated(rows),
    truncated,
  };
}

/** Current state of specific invoices (missing ids were deleted in QuickBooks). */
export async function listInvoicesByIds(realmId: string, ids: string[]): Promise<InvoiceSnapshot[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const out: InvoiceSnapshot[] = [];
  for (let i = 0; i < unique.length; i += 30) {
    const list = unique
      .slice(i, i + 30)
      .map((id) => `'${qboQuerySqlStringLiteral(id)}'`)
      .join(', ');
    const sql = `SELECT ${INVOICE_QUERY_FIELDS} FROM Invoice WHERE Id IN (${list}) MAXRESULTS 30`;
    const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
    const rows = qboQueryEntities<QboInvoice>(body as { QueryResponse?: Record<string, unknown> }, 'Invoice');
    out.push(...(await invoiceSnapshotsFromRows(realmId, rows, { rowsHaveFields: true })));
  }
  return out;
}

/** Lightweight API check for env-check / diagnostics (token refresh + one-row query). */
export async function probeQuickBooksApiAccess(realmId: string): Promise<{
  ok: boolean;
  apiBase: string;
  error?: string;
}> {
  const apiBase = getQuickBooksApiBase();
  try {
    const sql = 'SELECT Id FROM Estimate MAXRESULTS 1';
    await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
    return { ok: true, apiBase };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, apiBase, error: msg.slice(0, 400) };
  }
}

type QboAccount = {
  Id?: string;
  Name?: string;
  AccountType?: string;
  AccountSubType?: string;
  CurrentBalance?: number | string;
  CurrentBalanceWithSubAccounts?: number | string;
  SubAccount?: boolean;
  Active?: boolean;
  ParentRef?: { value?: string; name?: string };
};

function accountRowToBalance(a: QboAccount): BankAccountBalance | null {
  const id = a.Id?.trim();
  if (!id) return null;
  // Prefer explicit Active === false skip; Query may already filter Active = true.
  if (a.Active === false) return null;
  const name = a.Name?.trim() || `Account ${id}`;
  const parentId = a.ParentRef?.value?.trim() || undefined;
  return {
    id,
    name,
    accountType: a.AccountType?.trim(),
    accountSubType: a.AccountSubType?.trim(),
    balanceCents: dollarsToCents(a.CurrentBalance),
    balanceWithSubAccountsCents: dollarsToCents(a.CurrentBalanceWithSubAccounts ?? a.CurrentBalance),
    isSubAccount: a.SubAccount === true || Boolean(parentId),
    parentId,
    balanceSource: 'account_query',
  };
}

/**
 * Checking accounts from the Chart of Accounts (current register balance as QBO stores it).
 * Falls back to all Bank-type accounts if none are subtype Checking.
 */
export async function listCheckingAccountBalances(realmId: string): Promise<BankAccountBalance[]> {
  const checkingSql =
    "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance, CurrentBalanceWithSubAccounts, SubAccount, ParentRef, Active FROM Account WHERE AccountType = 'Bank' AND AccountSubType = 'Checking' AND Active = true MAXRESULTS 25";
  let body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(checkingSql)}`);
  let rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');

  if (rows.length === 0) {
    const bankSql =
      "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance, CurrentBalanceWithSubAccounts, SubAccount, ParentRef, Active FROM Account WHERE AccountType = 'Bank' AND Active = true MAXRESULTS 25";
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(bankSql)}`);
    rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');
  }

  const out = rows.map(accountRowToBalance).filter((x): x is BankAccountBalance => x != null);
  return out.sort((a, b) => b.balanceCents - a.balanceCents);
}

/**
 * Active Bank accounts with books/register balances.
 * Preference order per account:
 * 1) Balance Sheet as-of today (matches QBO Balance Sheet / COA presentation)
 * 2) GET Account/{id} CurrentBalance (register balance for that account)
 * 3) Account List report account_bal
 * 4) Query CurrentBalance (last resort)
 *
 * Note: QBO does not expose the bank-feed “Bank balance” from the Banking page via API.
 */
export async function listBankAccountsDetailed(realmId: string): Promise<BankAccountBalance[]> {
  const select =
    'Id, Name, AccountType, AccountSubType, CurrentBalance, CurrentBalanceWithSubAccounts, SubAccount, ParentRef, Active';
  const activeSql = `SELECT ${select} FROM Account WHERE AccountType = 'Bank' AND Active = true MAXRESULTS 100`;
  let body: unknown;
  try {
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(activeSql)}`);
  } catch (activeErr) {
    console.warn('[quickbooks] listBankAccountsDetailed Active filter failed; retrying without it', activeErr);
    const allSql = `SELECT ${select} FROM Account WHERE AccountType = 'Bank' MAXRESULTS 100`;
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(allSql)}`);
  }
  const rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');
  let accounts = rows.map(accountRowToBalance).filter((x): x is BankAccountBalance => x != null);

  // Hydrate CurrentBalance via GET — Query rows are often stale/sparse.
  accounts = await mapInBatches(accounts, 4, async (a) => {
    try {
      const full = await quickBooksCompanyJson(realmId, `account/${encodeURIComponent(a.id)}`);
      const acct = (full as { Account?: QboAccount }).Account;
      if (!acct) return a;
      const next = accountRowToBalance(acct);
      if (!next) return a;
      return { ...next, balanceSource: 'account_get' as const };
    } catch (e) {
      console.warn('[quickbooks] listBankAccountsDetailed: GET account failed', a.id, e);
      return a;
    }
  });

  const sheetById = await fetchBalanceSheetBankMap(realmId);
  if (sheetById.size > 0) {
    accounts = accounts.map((a) => {
      const fromSheet = sheetById.get(a.id);
      if (fromSheet == null) return a;
      return {
        ...a,
        balanceCents: fromSheet,
        balanceWithSubAccountsCents: fromSheet,
        balanceSource: 'balance_sheet',
      };
    });
  } else {
    // Balance Sheet unavailable — try Account List account_bal as a secondary overlay.
    const listRows = await fetchBankAccountListRows(realmId);
    if (listRows.length > 0) {
      const byId = new Map(listRows.map((r) => [r.id, r.balanceCents]));
      accounts = accounts.map((a) => {
        const fromList = byId.get(a.id);
        if (fromList == null) return a;
        return {
          ...a,
          balanceCents: fromList,
          balanceWithSubAccountsCents: fromList,
          balanceSource: 'account_list',
        };
      });
    }
  }

  return accounts.sort((a, b) => b.balanceCents - a.balanceCents);
}

async function fetchBalanceSheetBankMap(realmId: string): Promise<Map<string, number>> {
  const tz = (process.env.QUICKBOOKS_REPORT_TIMEZONE || 'America/Los_Angeles').trim() || 'America/Los_Angeles';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // Both start_date and end_date required — end_date alone can silently return YTD.
  const q = new URLSearchParams({
    start_date: today,
    end_date: today,
    accounting_method: 'Accrual',
  });
  try {
    const body = await quickBooksCompanyJson(realmId, `reports/BalanceSheet?${q.toString()}`);
    const parsed = parseBalanceSheetBankBalances(body);
    return new Map(parsed.map((r) => [r.id, r.balanceCents]));
  } catch (e) {
    console.warn('[quickbooks] BalanceSheet bank balances failed', e);
    return new Map();
  }
}

/**
 * QBO Account List report with account_bal — secondary source when Balance Sheet is unavailable.
 */
async function fetchBankAccountListRows(realmId: string) {
  const q = new URLSearchParams({
    account_type: 'Bank',
    account_status: 'Not_Deleted',
    columns: 'account_name,account_type,detail_acc_type,account_bal',
  });
  try {
    const body = await quickBooksCompanyJson(realmId, `reports/AccountList?${q.toString()}`);
    return parseAccountListBalances(body);
  } catch (e) {
    console.warn('[quickbooks] AccountList report failed; falling back to Account CurrentBalance', e);
    return [];
  }
}
