import {
  fetchEstimateById,
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
type QboCustomer = {
  Id?: string;
  DisplayName?: string;
  PrimaryEmailAddr?: QboEmailAddr;
};
type QboItem = { Id?: string; Name?: string; Type?: string; Active?: boolean };

function qboQueryEntities<T>(qr: { QueryResponse?: Record<string, unknown> } | undefined, key: string): T[] {
  const raw = qr?.QueryResponse?.[key];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as T[]) : [raw as T];
}

export function qboFaultLooksLikeDuplicateName(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /6240/.test(msg) || /duplicate name/i.test(msg);
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

export async function ensureQboCustomer(opts: {
  realmId: string;
  email: string;
  displayName: string;
}): Promise<QboCustomerRef> {
  const email = opts.email.trim().toLowerCase();
  const byEmail = await findCustomerByPrimaryEmail(opts.realmId, email);
  if (byEmail) return byEmail;

  const displayName = sanitizeQboDisplayName(opts.displayName);
  const names = splitPersonName(displayName);
  const payload: Record<string, unknown> = {
    DisplayName: displayName,
    PrimaryEmailAddr: { Address: email },
    Notes: 'Created from a Gmail thread in Dash.',
  };
  if (names.given) payload.GivenName = names.given;
  if (names.family) payload.FamilyName = names.family;

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
    if (existing) return existing;

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

export async function findActiveSalesItem(realmId: string): Promise<QboSalesItemRef | null> {
  const sql = `SELECT Id, Name, Type FROM Item WHERE Active = true MAXRESULTS 50`;
  const body = await quickBooksCompanyJson(realmId, `query?query=${encodeURIComponent(sql)}`);
  const rows = qboQueryEntities<QboItem>(body as { QueryResponse?: Record<string, unknown> }, 'Item').filter(
    (i) => i.Id && i.Type && i.Type !== 'Category' && i.Type !== 'Group',
  );
  if (rows.length === 0) return null;

  const score = (i: QboItem): number => {
    const name = (i.Name || '').toLowerCase();
    const type = i.Type || '';
    if (type === 'Service' && /service/.test(name)) return 0;
    if (type === 'Service') return 1;
    if (type === 'NonInventory') return 2;
    return 3;
  };
  rows.sort((a, b) => score(a) - score(b));
  const best = rows[0]!;
  return { id: best.Id!, name: best.Name?.trim() || 'Item', type: best.Type || '' };
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
  return payload;
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

  let lastErr: unknown = null;
  for (const attempt of attempts) {
    const payload = buildUnsentEstimatePayload({
      customerId: opts.customerId,
      email: opts.email,
      subject: opts.subject,
      snippet: opts.snippet,
      item: attempt.item,
      amount: attempt.amount,
    });
    try {
      const body = await quickBooksCompanyJsonPost(opts.realmId, 'estimate', payload);
      const id = (body as { Estimate?: { Id?: string } }).Estimate?.Id;
      if (!id) throw new Error('QuickBooks estimate create returned no Id.');
      const snapshot = await fetchEstimateById(opts.realmId, id);
      return { ...snapshot, status: 'DRAFT', totalAmtCents: snapshot.totalAmtCents };
    } catch (e) {
      lastErr = e;
      console.warn('[quickbooks] unsent estimate create attempt failed', {
        usedItem: attempt.item?.id ?? null,
        amount: attempt.amount,
        e,
      });
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('QuickBooks would not accept a draft estimate line for this company.');
}
