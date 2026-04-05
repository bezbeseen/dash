/**
 * EXPERIMENTAL / DEV-ONLY — isolated from core sync logic.
 * Parse QuickBooks Online "Transaction List by Date" CSV and upsert local Job rows
 * for UI preview. Not a substitute for the QuickBooks API.
 *
 * Used only from /dev/qbo-csv + POST /api/dev/qbo-transaction-list-csv
 */

import { upsertJobFromEstimate, upsertJobFromInvoice } from '@/lib/domain/sync';
import type { EstimateSnapshot, InvoiceSnapshot } from '@/lib/quickbooks/types';

/** Minimal CSV parser: handles double-quoted fields with commas. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    let field = '';
    let inQuotes = false;

    while (i < len) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (c === '\r') {
        i++;
        continue;
      }
      if (c === '\n') {
        i++;
        break;
      }
      field += c;
      i++;
    }
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r];
    const first = (cells[0] ?? '').trim();
    const joined = cells.join(',');
    // QBO export: preamble rows then header "Date","Transaction type",…
    if (first === 'Date' && joined.includes('Transaction type')) {
      return r;
    }
  }
  return -1;
}

export function parseMoneyToCents(raw: string): number {
  const s = raw.replace(/,/g, '').trim();
  if (!s || s === '-') return 0;
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function parseUsDate(raw: string): Date | undefined {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type Agg = {
  docNum: string;
  name: string;
  amountCents: number;
  date: Date | undefined;
  memo: string;
};

const PREFIX_EST = 'csv-est';
const PREFIX_INV = 'csv-inv';

function makeCustomerId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `csv-${slug || 'customer'}`;
}

/**
 * Read QBO Transaction List CSV text; upsert estimates then invoices.
 * Links invoice → estimate when customer name + total amount match (one estimate per match).
 */
export async function importTransactionListCsv(text: string): Promise<{
  estimates: number;
  invoices: number;
  skippedVoid: number;
}> {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    throw new Error(
      'Could not find a header row starting with "Date,". Export "Transaction List by Date" from QuickBooks as CSV.',
    );
  }

  const header = rows[headerIdx];
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const iDate = col('Date');
  const iType = col('Transaction type');
  const iNum = col('Num');
  const iName = col('Name');
  const iMemo = col('Memo/Description');
  const iAmount = col('Amount');
  if (iDate < 0 || iType < 0 || iNum < 0 || iAmount < 0) {
    throw new Error('Unexpected CSV columns — need Date, Transaction type, Num, Amount.');
  }

  const estMap = new Map<string, Agg>();
  const invMap = new Map<string, Agg>();

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < Math.max(iDate, iType, iNum, iAmount) + 1) continue;

    const type = row[iType]?.trim() ?? '';
    if (type !== 'Estimate' && type !== 'Invoice') continue;

    const num = (row[iNum] ?? '').trim();
    if (!num) continue;

    const name = (iName >= 0 ? row[iName] : '')?.trim() ?? '';
    const memo = (iMemo >= 0 ? row[iMemo] : '')?.trim() ?? '';
    const amountCents = parseMoneyToCents(row[iAmount] ?? '0');
    const date = parseUsDate(row[iDate] ?? '');

    const map = type === 'Estimate' ? estMap : invMap;
    const key = num;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        docNum: num,
        name,
        amountCents,
        date,
        memo,
      });
    } else {
      prev.amountCents += amountCents;
      if (!prev.name && name) prev.name = name;
      if (date && (!prev.date || date > prev.date)) prev.date = date;
      prev.memo = prev.memo || memo;
    }
  }

  let skippedVoid = 0;

  const estNums = [...estMap.keys()].sort((a, b) => Number(a) - Number(b));
  const invNums = [...invMap.keys()].sort((a, b) => Number(a) - Number(b));

  const consumedEstimates = new Set<string>();

  const linkedEstimateForInvoice = new Map<string, string>();
  for (const inum of invNums) {
    const inv = invMap.get(inum)!;
    if (/void/i.test(inv.memo) || inv.amountCents <= 0) continue;
    for (const enum_ of estNums) {
      if (consumedEstimates.has(enum_)) continue;
      const est = estMap.get(enum_)!;
      if (est.name === inv.name && est.amountCents === inv.amountCents && est.amountCents > 0) {
        linkedEstimateForInvoice.set(inum, enum_);
        consumedEstimates.add(enum_);
        break;
      }
    }
  }

  for (const enum_ of estNums) {
    const est = estMap.get(enum_)!;
    const eid = `${PREFIX_EST}-${enum_}`;

    const hasInvoice = [...linkedEstimateForInvoice.entries()].some(([, en]) => en === enum_);
    const snap: EstimateSnapshot = {
      id: eid,
      customerId: makeCustomerId(est.name || 'Customer'),
      customerName: est.name || 'Customer',
      projectName: `Estimate #${enum_}`,
      totalAmtCents: Math.max(0, est.amountCents),
      status: hasInvoice ? 'ACCEPTED' : 'SENT',
      txnDate: est.date?.toISOString(),
      acceptedAt: hasInvoice ? est.date?.toISOString() : undefined,
    };
    await upsertJobFromEstimate(snap, {});
  }

  for (const inum of invNums) {
    const inv = invMap.get(inum)!;
    if (/void/i.test(inv.memo) || inv.amountCents <= 0) {
      skippedVoid++;
      continue;
    }

    const linkedEst = linkedEstimateForInvoice.get(inum);
    const linkedEstimateId = linkedEst ? `${PREFIX_EST}-${linkedEst}` : undefined;

    const snap: InvoiceSnapshot = {
      id: `${PREFIX_INV}-${inum}`,
      linkedEstimateId,
      customerId: makeCustomerId(inv.name || 'Customer'),
      customerName: inv.name || 'Customer',
      totalAmtCents: Math.max(0, inv.amountCents),
      balanceCents: Math.max(0, inv.amountCents),
      amountPaidCents: 0,
      status: 'OPEN',
      docNumber: inum,
      txnDate: inv.date?.toISOString(),
    };
    await upsertJobFromInvoice(snap, {});
  }

  return {
    estimates: estMap.size,
    invoices: invMap.size,
    skippedVoid,
  };
}
