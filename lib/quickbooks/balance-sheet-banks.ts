/**
 * Pull Bank account lines from reports/BalanceSheet (as-of a date).
 * ColData[0].id is the Chart of Accounts account Id when present.
 */

export type BalanceSheetBankRow = {
  id: string;
  name: string;
  balanceCents: number;
};

type ColDataCell = { value?: string; id?: string };

function parseMoneyCell(raw: string | undefined): number {
  if (raw == null) return 0;
  let s = String(raw).replace(/[$,\s]/g, '').trim();
  if (!s) return 0;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  if (s === '-') return 0;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

function colDataArray(row: Record<string, unknown>): ColDataCell[] | null {
  const raw = row.ColData;
  if (!Array.isArray(raw)) return null;
  return raw as ColDataCell[];
}

function walk(
  node: unknown,
  inBankSection: boolean,
  out: BalanceSheetBankRow[],
): void {
  if (node == null || typeof node !== 'object') return;
  const row = node as Record<string, unknown>;

  let bank = inBankSection;
  const group = String(row.group ?? '').toLowerCase();
  const header = row.Header as Record<string, unknown> | undefined;
  if (header) {
    const cols = colDataArray(header);
    const title = (cols?.[0]?.value ?? '').toLowerCase();
    if (
      group.includes('bank') ||
      title.includes('bank accounts') ||
      title === 'bank' ||
      title.includes('checking')
    ) {
      bank = true;
    }
  }

  if (bank && row.type === 'Data') {
    const cols = colDataArray(row);
    if (cols && cols.length >= 2) {
      const nameCell = cols[0];
      const id = nameCell?.id?.trim();
      const name = nameCell?.value?.trim();
      const amount = cols[cols.length - 1]?.value;
      if (id && name) {
        out.push({ id, name, balanceCents: parseMoneyCell(amount) });
      }
    }
  }

  // Section summaries for "Total Bank Accounts" are not individual accounts — skip.

  const rows = row.Rows as Record<string, unknown> | undefined;
  if (rows?.Row != null) {
    const list = rows.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const child of arr) walk(child, bank, out);
  }
}

export function parseBalanceSheetBankBalances(body: unknown): BalanceSheetBankRow[] {
  const root = body as Record<string, unknown>;
  const out: BalanceSheetBankRow[] = [];
  const rowsWrap = root.Rows as Record<string, unknown> | undefined;
  if (rowsWrap?.Row != null) {
    const list = rowsWrap.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const r of arr) walk(r, false, out);
  }
  const byId = new Map<string, BalanceSheetBankRow>();
  for (const row of out) byId.set(row.id, row);
  return [...byId.values()];
}
