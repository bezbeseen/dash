/**
 * Parse QBO reports/AccountList — account_bal matches the Chart of Accounts /
 * register balance shown in the QuickBooks UI better than a bare Account Query
 * CurrentBalance in some companies.
 */

export type AccountListBalanceRow = {
  id: string;
  name: string;
  accountType?: string;
  detailType?: string;
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

type ColIndex = {
  name: number;
  bal: number;
  type?: number;
  detail?: number;
};

function columnIndexes(root: Record<string, unknown>): ColIndex {
  const columns = (root.Columns as { Column?: unknown } | undefined)?.Column;
  const list = Array.isArray(columns) ? columns : columns ? [columns] : [];
  const findExact = (...needles: string[]) => {
    const i = list.findIndex((c) => {
      const col = c as { ColType?: string; ColTitle?: string };
      const typ = (col.ColType ?? '').toLowerCase().replace(/\s+/g, '_');
      const title = (col.ColTitle ?? '').toLowerCase().replace(/\s+/g, '_');
      return needles.some((n) => typ === n || title === n);
    });
    return i >= 0 ? i : -1;
  };
  const findIncludes = (...needles: string[]) => {
    const i = list.findIndex((c) => {
      const col = c as { ColType?: string; ColTitle?: string };
      const hay = `${col.ColType ?? ''} ${col.ColTitle ?? ''}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    });
    return i >= 0 ? i : -1;
  };
  // Prefer exact ColType matches — loose "balance"/"account" matching picks the wrong column.
  const name = findExact('account', 'account_name') >= 0
    ? findExact('account', 'account_name')
    : findIncludes('account_name');
  const bal = findExact('account_bal', 'account_balance') >= 0
    ? findExact('account_bal', 'account_balance')
    : findIncludes('account_bal');
  const typeIdx = findExact('account_type') >= 0 ? findExact('account_type') : findIncludes('account_type');
  const detailIdx =
    findExact('detail_acc_type', 'detail_type') >= 0
      ? findExact('detail_acc_type', 'detail_type')
      : findIncludes('detail_acc');
  return {
    name: name >= 0 ? name : 0,
    bal: bal >= 0 ? bal : Math.max(list.length - 1, 0),
    type: typeIdx >= 0 ? typeIdx : undefined,
    detail: detailIdx >= 0 ? detailIdx : undefined,
  };
}

function walkRows(node: unknown, idx: ColIndex, out: AccountListBalanceRow[]): void {
  if (node == null || typeof node !== 'object') return;
  const row = node as Record<string, unknown>;

  const tryEmit = (cols: ColDataCell[] | null) => {
    if (!cols || cols.length === 0) return;
    const nameCell = cols[idx.name] ?? cols[0];
    const id = nameCell?.id?.trim();
    const name = nameCell?.value?.trim();
    // Prefer rows that have an account id on the name cell (QBO puts COA Id there).
    if (!id || !name) return;
    const balCell = cols[idx.bal] ?? cols[cols.length - 1];
    out.push({
      id,
      name,
      accountType: idx.type != null ? cols[idx.type]?.value?.trim() : undefined,
      detailType: idx.detail != null ? cols[idx.detail]?.value?.trim() : undefined,
      balanceCents: parseMoneyCell(balCell?.value),
    });
  };

  if (row.type === 'Data') {
    tryEmit(colDataArray(row));
  }

  const rows = row.Rows as Record<string, unknown> | undefined;
  if (rows && rows.Row != null) {
    const list = rows.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const child of arr) walkRows(child, idx, out);
  }
}

/** Extract per-account balances from a reports/AccountList JSON body. */
export function parseAccountListBalances(body: unknown): AccountListBalanceRow[] {
  const root = body as Record<string, unknown>;
  const idx = columnIndexes(root);
  const out: AccountListBalanceRow[] = [];
  const rowsWrap = root.Rows as Record<string, unknown> | undefined;
  if (rowsWrap?.Row != null) {
    const list = rowsWrap.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const r of arr) walkRows(r, idx, out);
  }
  // Dedupe by id (keep last)
  const byId = new Map<string, AccountListBalanceRow>();
  for (const row of out) byId.set(row.id, row);
  return [...byId.values()];
}
