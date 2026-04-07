import crypto from 'crypto';
import { getQuickBooksApiBase } from '@/lib/quickbooks/config';
import { getValidQuickBooksAccessToken } from '@/lib/quickbooks/tokens-db';
import { BankAccountBalance, EstimateSnapshot, InvoiceSnapshot } from './types';

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
  CustomerMemo?: string;
  PrivateNote?: string;
  MetaData?: QboMeta;
};

export async function quickBooksCompanyJson(realmId: string, path: string): Promise<unknown> {
  const token = await getValidQuickBooksAccessToken(realmId);
  const base = getQuickBooksApiBase();
  const url = `${base}/v3/company/${encodeURIComponent(realmId)}/${path}${path.includes('?') ? '&' : '?'}minorversion=65`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QuickBooks API ${res.status} for ${path}: ${text}`);
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

function estimateFromQbo(e: QboEstimate, fallbackId: string): EstimateSnapshot {
  const id = e.Id ?? fallbackId;
  const customerName = e.CustomerRef?.name?.trim() || `Customer ${e.CustomerRef?.value ?? 'unknown'}`;
  const projectName = e.DocNumber?.trim() ? `Estimate #${e.DocNumber}` : `Estimate #${id}`;

  return {
    id,
    customerId: e.CustomerRef?.value,
    customerName,
    projectName,
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

  return {
    id,
    linkedEstimateId: linked?.TxnId,
    customerId: inv.CustomerRef?.value,
    customerName,
    totalAmtCents: totalCents,
    balanceCents,
    amountPaidCents,
    status,
    docNumber: inv.DocNumber?.trim() || undefined,
    txnDate: inv.TxnDate,
    dueDate: inv.DueDate,
    billEmail: inv.BillEmail?.Address?.trim() || undefined,
    billEmailCc: inv.BillEmailCc?.Address?.trim() || undefined,
    customerMemo: typeof inv.CustomerMemo === 'string' ? inv.CustomerMemo.trim() || undefined : undefined,
    privateNote: inv.PrivateNote?.trim() || undefined,
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

/** Pull recent estimates from QuickBooks (sandbox or prod per env). */
export async function listRecentEstimates(realmId: string, maxResults = 100): Promise<EstimateSnapshot[]> {
  const sql = `SELECT * FROM Estimate MAXRESULTS ${maxResults}`;
  const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
  const estimates = qboQueryEntities<QboEstimate>(body as { QueryResponse?: Record<string, unknown> }, 'Estimate');
  return estimates.map((e) => estimateFromQbo(e, e.Id ?? ''));
}

/**
 * List recent invoices, then hydrate each with GET invoice/{id}.
 * Query responses often omit Balance and LinkedTxn; without Balance every row looks “open / unpaid”
 * and paid jobs never reach the PAID column.
 */
export async function listRecentInvoices(realmId: string, maxResults = 100): Promise<InvoiceSnapshot[]> {
  const ordered = `SELECT Id FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${maxResults}`;
  let body: unknown;
  try {
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(ordered)}`);
  } catch {
    const fallback = `SELECT Id FROM Invoice MAXRESULTS ${maxResults}`;
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(fallback)}`);
  }
  const stubs = qboQueryEntities<QboInvoice>(body as { QueryResponse?: Record<string, unknown> }, 'Invoice');
  const ids = [...new Set(stubs.map((s) => s.Id).filter((id): id is string => Boolean(id)))];

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await fetchInvoiceById(realmId, id);
      } catch (e) {
        console.warn('[quickbooks] listRecentInvoices: GET invoice failed, skipping id', id, e);
        return null;
      }
    }),
  );

  return results.filter((x): x is InvoiceSnapshot => x != null);
}

type QboAccount = {
  Id?: string;
  Name?: string;
  AccountType?: string;
  AccountSubType?: string;
  CurrentBalance?: number | string;
};

function accountRowToBalance(a: QboAccount): BankAccountBalance | null {
  const id = a.Id?.trim();
  if (!id) return null;
  const name = a.Name?.trim() || `Account ${id}`;
  return {
    id,
    name,
    accountType: a.AccountType?.trim(),
    accountSubType: a.AccountSubType?.trim(),
    balanceCents: dollarsToCents(a.CurrentBalance),
  };
}

/**
 * Checking accounts from the Chart of Accounts (current register balance as QBO stores it).
 * Falls back to all Bank-type accounts if none are subtype Checking.
 */
export async function listCheckingAccountBalances(realmId: string): Promise<BankAccountBalance[]> {
  const checkingSql =
    "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance FROM Account WHERE AccountType = 'Bank' AND AccountSubType = 'Checking' MAXRESULTS 25";
  let body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(checkingSql)}`);
  let rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');

  if (rows.length === 0) {
    const bankSql =
      "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance FROM Account WHERE AccountType = 'Bank' MAXRESULTS 25";
    body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(bankSql)}`);
    rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');
  }

  const out = rows.map(accountRowToBalance).filter((x): x is BankAccountBalance => x != null);
  return out.sort((a, b) => b.balanceCents - a.balanceCents);
}

/**
 * All Chart of Accounts rows with AccountType = Bank (up to 100). For the Cash & banks page;
 * the sidebar widget uses {@link listCheckingAccountBalances} instead (checking-first).
 */
export async function listBankAccountsDetailed(realmId: string): Promise<BankAccountBalance[]> {
  const bankSql =
    "SELECT Id, Name, AccountType, AccountSubType, CurrentBalance FROM Account WHERE AccountType = 'Bank' MAXRESULTS 100";
  const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(bankSql)}`);
  const rows = qboQueryEntities<QboAccount>(body as { QueryResponse?: Record<string, unknown> }, 'Account');
  const out = rows.map(accountRowToBalance).filter((x): x is BankAccountBalance => x != null);
  return out.sort((a, b) => b.balanceCents - a.balanceCents);
}
