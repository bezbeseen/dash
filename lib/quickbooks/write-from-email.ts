import { formatPhoneDisplay, plausibleUsPhoneDigits } from '@/lib/domain/inbound-phone-rules';
import {
  fetchEstimateById,
  listRecentEstimates,
  qboQuerySqlStringLiteral,
  quickBooksCompanyJson,
  quickBooksCompanyJsonPost,
} from '@/lib/quickbooks/client';
import type { EstimateSnapshot } from '@/lib/quickbooks/types';

export type QboCustomerRef = {
  id: string;
  displayName: string;
  email: string | null;
  created: boolean;
};

export type QboSalesItemRef = {
  id: string;
  name: string;
  type: string;
};

type QboEmailAddr = { Address?: string };
type QboPhone = { FreeFormNumber?: string };
type QboCustomer = {
  Id?: string;
  SyncToken?: string;
  DisplayName?: string;
  PrimaryEmailAddr?: QboEmailAddr;
  PrimaryPhone?: QboPhone;
};
type QboItem = { Id?: string; Name?: string; Type?: string; Active?: boolean };
type QboEstimateStub = { Id?: string; DocNumber?: string };

function qboQueryEntities<T>(qr: { QueryResponse?: Record<string, unknown> } | undefined, key: string): T[] {
  const raw = qr?.QueryResponse?.[key];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as T[]) : [raw as T];
}

export function qboFaultLooksLikeDuplicateName(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /6240/.test(msg) || /duplicate name/i.test(msg);
}

export function qboFaultLooksLikeDuplicateDocNumber(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /6140/.test(msg) ||
    /duplicate document number/i.test(msg) ||
    /duplicate.*doc(?:ument)?\s*number/i.test(msg)
  );
}

/** Deleted / inactive QBO estimate (Fault 610) or GET that returns no Estimate. */
export function qboFaultLooksLikeMissingOrInactiveEstimate(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b610\b/.test(msg) ||
    /object not found/i.test(msg) ||
    /made inactive/i.test(msg) ||
    /missing Estimate object/i.test(msg)
  );
}

const DEFAULT_FIRST_ESTIMATE_DOC_NUMBER = '1001';

export function parseEstimateDocNumber(
  raw: string | null | undefined,
): { prefix: string; n: number; width: number } | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /^(.*?)(\d+)$/.exec(s);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n < 0) return null;
  return { prefix: m[1]!, n, width: m[2]!.length };
}

export function formatEstimateDocNumber(prefix: string, n: number, width: number): string {
  return `${prefix}${String(n).padStart(width, '0')}`.slice(0, 21);
}

/** Next DocNumber from newest-first recent estimates (skip blanks; keep newest prefix). */
export function nextEstimateDocNumber(recentNewestFirst: readonly string[]): string {
  const parsed = recentNewestFirst
    .map(parseEstimateDocNumber)
    .filter((p): p is NonNullable<typeof p> => p != null);
  if (parsed.length === 0) return DEFAULT_FIRST_ESTIMATE_DOC_NUMBER;
  const style = parsed[0]!;
  let maxN = style.n;
  for (const p of parsed) {
    if (p.prefix === style.prefix && p.n > maxN) maxN = p.n;
  }
  return formatEstimateDocNumber(style.prefix, maxN + 1, style.width);
}

export function incrementEstimateDocNumber(current: string): string {
  const p = parseEstimateDocNumber(current);
  if (!p) return nextEstimateDocNumber([current]);
  return formatEstimateDocNumber(p.prefix, p.n + 1, p.width);
}

export function qboPrimaryPhoneField(
  phone: string | null | undefined,
): { FreeFormNumber: string } | undefined {
  const digits = plausibleUsPhoneDigits(phone);
  if (!digits) return undefined;
  return { FreeFormNumber: formatPhoneDisplay(digits) };
}

/** Any existing QBO PrimaryPhone stays; we only fill a blank. */
export function shouldWriteQboPrimaryPhone(
  existingFreeForm: string | null | undefined,
  foundPhone: string | null | undefined,
): boolean {
  if (!plausibleUsPhoneDigits(foundPhone)) return false;
  if (existingFreeForm?.trim()) return false;
  return true;
}

export function buildQboCustomerCreatePayload(opts: {
  displayName: string;
  email: string;
  phone?: string | null;
  notes?: string;
}): Record<string, unknown> {
  const displayName = sanitizeQboDisplayName(opts.displayName);
  const names = splitPersonName(displayName);
  const payload: Record<string, unknown> = {
    DisplayName: displayName,
    PrimaryEmailAddr: { Address: opts.email.trim().toLowerCase() },
    Notes: opts.notes ?? 'Created from a Gmail thread in Dash.',
  };
  if (names.given) payload.GivenName = names.given;
  if (names.family) payload.FamilyName = names.family;
  const phone = qboPrimaryPhoneField(opts.phone);
  if (phone) payload.PrimaryPhone = phone;
  return payload;
}

/** QBO DisplayName cannot include `:`. */
export function sanitizeQboDisplayName(raw: string): string {
  const cleaned = raw
    .replace(/[:]+/g, ' ')
    .replace(/["\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'Customer';
}

export function splitPersonName(displayName: string): { given?: string; family?: string } {
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  return { given: parts[0]!.slice(0, 25), family: parts.slice(1).join(' ').slice(0, 25) };
}

export async function findCustomerByPrimaryEmail(
  realmId: string,
  email: string,
): Promise<QboCustomerRef | null> {
  const addr = email.trim().toLowerCase();
  if (!addr.includes('@')) return null;
  const lit = qboQuerySqlStringLiteral(addr);
  const sql = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE PrimaryEmailAddr = '${lit}' MAXRESULTS 5`;
  try {
    const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
    const rows = qboQueryEntities<QboCustomer>(body as { QueryResponse?: Record<string, unknown> }, 'Customer');
    const hit = rows.find((c) => c.Id);
    if (!hit?.Id) return null;
    return {
      id: hit.Id,
      displayName: hit.DisplayName?.trim() || addr,
      email: hit.PrimaryEmailAddr?.Address?.trim() || addr,
      created: false,
    };
  } catch (e) {
    console.warn('[quickbooks] customer email query failed', e);
    return null;
  }
}

async function findCustomerByDisplayName(realmId: string, displayName: string): Promise<QboCustomerRef | null> {
  const name = sanitizeQboDisplayName(displayName);
  const lit = qboQuerySqlStringLiteral(name);
  const sql = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE DisplayName = '${lit}' MAXRESULTS 5`;
  try {
    const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
    const rows = qboQueryEntities<QboCustomer>(body as { QueryResponse?: Record<string, unknown> }, 'Customer');
    const hit = rows.find((c) => c.Id);
    if (!hit?.Id) return null;
    return {
      id: hit.Id,
      displayName: hit.DisplayName?.trim() || name,
      email: hit.PrimaryEmailAddr?.Address?.trim() || null,
      created: false,
    };
  } catch (e) {
    console.warn('[quickbooks] customer name query failed', e);
    return null;
  }
}

export async function maybeSetMissingPrimaryPhone(
  realmId: string,
  customerId: string,
  phone: string | null | undefined,
): Promise<void> {
  const field = qboPrimaryPhoneField(phone);
  if (!field) return;
  try {
    const body = await quickBooksCompanyJson(realmId, `customer/${encodeURIComponent(customerId)}`);
    const existing = (body as { Customer?: QboCustomer }).Customer;
    if (!existing?.Id || existing.SyncToken == null || existing.SyncToken === '') return;
    if (!shouldWriteQboPrimaryPhone(existing.PrimaryPhone?.FreeFormNumber, phone)) return;
    await quickBooksCompanyJsonPost(realmId, 'customer', {
      Id: existing.Id,
      SyncToken: String(existing.SyncToken),
      sparse: true,
      PrimaryPhone: field,
    });
  } catch (e) {
    console.warn('[quickbooks] could not set customer PrimaryPhone', e);
  }
}

export async function ensureQboCustomer(opts: {
  realmId: string;
  email: string;
  displayName: string;
  phone?: string | null;
}): Promise<QboCustomerRef> {
  const email = opts.email.trim().toLowerCase();
  const byEmail = await findCustomerByPrimaryEmail(opts.realmId, email);
  if (byEmail) {
    await maybeSetMissingPrimaryPhone(opts.realmId, byEmail.id, opts.phone);
    return byEmail;
  }

  const displayName = sanitizeQboDisplayName(opts.displayName);
  const payload = buildQboCustomerCreatePayload({
    displayName,
    email,
    phone: opts.phone,
  });

  try {
    const body = await quickBooksCompanyJsonPost(opts.realmId, 'customer', payload);
    const created = (body as { Customer?: QboCustomer }).Customer;
    if (!created?.Id) throw new Error('QuickBooks customer create returned no Id.');
    return {
      id: created.Id,
      displayName: created.DisplayName?.trim() || displayName,
      email: created.PrimaryEmailAddr?.Address?.trim() || email,
      created: true,
    };
  } catch (e) {
    if (!qboFaultLooksLikeDuplicateName(e)) throw e;
    const existing =
      (await findCustomerByDisplayName(opts.realmId, displayName)) ||
      (await findCustomerByPrimaryEmail(opts.realmId, email));
    if (existing) {
      await maybeSetMissingPrimaryPhone(opts.realmId, existing.id, opts.phone);
      return existing;
    }

    const altName = sanitizeQboDisplayName(`${displayName} ${email}`);
    const retry = await quickBooksCompanyJsonPost(opts.realmId, 'customer', {
      ...payload,
      DisplayName: altName,
    });
    const created = (retry as { Customer?: QboCustomer }).Customer;
    if (!created?.Id) throw e;
    return {
      id: created.Id,
      displayName: created.DisplayName?.trim() || altName,
      email: created.PrimaryEmailAddr?.Address?.trim() || email,
      created: true,
    };
  }
}

/** $0 Gmail estimate lines must not reference inactive/category QBO items (Fault 610 on PDF/read). */
export function qboItemIsActiveSalesItem(item: QboItem): boolean {
  if (!item.Id) return false;
  if (item.Active === false) return false;
  const type = item.Type || '';
  if (!type || type === 'Category' || type === 'Group' || type === 'Subtotal') return false;
  return true;
}

function scoreActiveSalesItem(item: QboItem): number {
  const name = (item.Name || '').toLowerCase();
  const type = item.Type || '';
  if (type === 'Service' && /service/.test(name)) return 0;
  if (type === 'Service') return 1;
  if (type === 'NonInventory') return 2;
  return 3;
}

export async function findActiveSalesItem(realmId: string): Promise<QboSalesItemRef | null> {
  const queries = [
    `SELECT Id, Name, Type, Active FROM Item WHERE Active = true AND Type = 'Service' MAXRESULTS 50`,
    `SELECT Id, Name, Type, Active FROM Item WHERE Active = true MAXRESULTS 50`,
  ];
  for (const sql of queries) {
    try {
      const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
      const rows = qboQueryEntities<QboItem>(body as { QueryResponse?: Record<string, unknown> }, 'Item')
        .filter(qboItemIsActiveSalesItem)
        .filter((i) => i.Active !== false);
      if (rows.length === 0) continue;
      rows.sort((a, b) => scoreActiveSalesItem(a) - scoreActiveSalesItem(b));
      const best = rows[0]!;
      return { id: best.Id!, name: best.Name?.trim() || 'Item', type: best.Type || '' };
    } catch (e) {
      console.warn('[quickbooks] active item query failed', sql.slice(0, 80), e);
    }
  }
  return null;
}

export function clipQboMemo(raw: string, max: number): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function buildUnsentEstimatePayload(opts: {
  customerId: string;
  email: string;
  subject: string;
  snippet: string;
  item: QboSalesItemRef | null;
  amount?: number;
  docNumber?: string | null;
}): Record<string, unknown> {
  const subject = clipQboMemo(opts.subject || 'Email lead', 1000);
  const snippet = clipQboMemo(opts.snippet, 1500);
  const lineDesc = clipQboMemo(opts.subject || opts.snippet || 'From Gmail', 4000);
  const privateNote = clipQboMemo(
    [`Created from Gmail in Dash (not sent).`, `Customer: ${opts.email}`, snippet && `Snippet: ${snippet}`]
      .filter(Boolean)
      .join('\n'),
    4000,
  );
  const amount = opts.amount ?? 0;
  const line: Record<string, unknown> = opts.item
    ? {
        DetailType: 'SalesItemLineDetail',
        Amount: amount,
        Description: lineDesc,
        SalesItemLineDetail: {
          ItemRef: { value: opts.item.id, name: opts.item.name },
          Qty: 1,
          UnitPrice: amount,
        },
      }
    : {
        DetailType: 'DescriptionOnly',
        Amount: 0,
        Description: lineDesc,
      };

  const payload: Record<string, unknown> = {
    CustomerRef: { value: opts.customerId },
    CustomerMemo: { value: subject },
    PrivateNote: privateNote,
    EmailStatus: 'NotSet',
    Line: [line],
  };
  if (opts.email.includes('@')) {
    payload.BillEmail = { Address: opts.email };
  }
  const docNumber = opts.docNumber?.trim();
  if (docNumber) payload.DocNumber = docNumber.slice(0, 21);
  return payload;
}

async function listRecentEstimateDocNumbers(realmId: string): Promise<string[] | null> {
  const queries = [
    `SELECT Id, DocNumber FROM Estimate ORDERBY MetaData.CreateTime DESC MAXRESULTS 50`,
    `SELECT Id, DocNumber FROM Estimate ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS 50`,
  ];
  for (const sql of queries) {
    try {
      const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
      const rows = qboQueryEntities<QboEstimateStub>(body as { QueryResponse?: Record<string, unknown> }, 'Estimate');
      return rows.map((r) => r.DocNumber?.trim() ?? '').filter(Boolean);
    } catch (e) {
      console.warn('[quickbooks] estimate DocNumber query failed', sql.slice(0, 80), e);
    }
  }
  try {
    const recent = await listRecentEstimates(realmId, 50);
    return recent.map((e) => e.docNumber?.trim() ?? '').filter(Boolean);
  } catch (e) {
    console.warn('[quickbooks] listRecentEstimates fallback for DocNumber failed', e);
    return null;
  }
}

/**
 * Saved estimate the shop can finish in QBO. Forced Dash status DRAFT so it stays
 * on Pre-quote until they actually send it (QBO often reports Pending).
 */
export async function createUnsentEstimateFromEmail(opts: {
  realmId: string;
  customerId: string;
  email: string;
  subject: string;
  snippet: string;
}): Promise<EstimateSnapshot> {
  const item = await findActiveSalesItem(opts.realmId);
  const attempts: { item: QboSalesItemRef | null; amount: number }[] = item
    ? [
        { item, amount: 0 },
        { item, amount: 0.01 },
      ]
    : [{ item: null, amount: 0 }];

  const recentDocs = await listRecentEstimateDocNumbers(opts.realmId);
  let docNumber = recentDocs == null ? null : nextEstimateDocNumber(recentDocs);

  let lastErr: unknown = null;
  for (const attempt of attempts) {
    for (let docTry = 0; docTry < 3; docTry++) {
      const payload = buildUnsentEstimatePayload({
        customerId: opts.customerId,
        email: opts.email,
        subject: opts.subject,
        snippet: opts.snippet,
        item: attempt.item,
        amount: attempt.amount,
        docNumber,
      });
      try {
        const body = await quickBooksCompanyJsonPost(opts.realmId, 'estimate', payload);
        const id = (body as { Estimate?: { Id?: string } }).Estimate?.Id;
        if (!id) throw new Error('QuickBooks estimate create returned no Id.');
        const snapshot = await fetchEstimateById(opts.realmId, id);
        return { ...snapshot, status: 'DRAFT', totalAmtCents: snapshot.totalAmtCents };
      } catch (e) {
        lastErr = e;
        if (qboFaultLooksLikeDuplicateDocNumber(e) && docNumber && docTry < 2) {
          docNumber = incrementEstimateDocNumber(docNumber);
          continue;
        }
        console.warn('[quickbooks] unsent estimate create attempt failed', {
          usedItem: attempt.item?.id ?? null,
          amount: attempt.amount,
          docNumber,
          e,
        });
        break;
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('QuickBooks would not accept a draft estimate line for this company.');
}
