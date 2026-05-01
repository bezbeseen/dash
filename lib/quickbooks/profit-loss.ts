import { fetchProfitAndLossReport } from '@/lib/quickbooks/client';

export type PnlLine = { label: string; amountCents: number; depth: number };

export type PnlMonthToDateResult = {
  ok: true;
  reportName: string;
  startPeriod: string;
  endPeriod: string;
  currency: string | null;
  accountingMethod: 'Accrual' | 'Cash';
  /** IANA zone used for month start / "today" dates. */
  reportTimeZone: string;
  companyName: string | null;
  lines: PnlLine[];
  /** Last "Net Income" (or Net Operating Income) summary row if found. */
  netIncomeCents: number | null;
};

export type PnlErrorResult = {
  ok: false;
  error: string;
};

/** IANA timezone for month boundaries (calendar month ? "today" in this zone). */
export function quickBooksReportTimeZone(): string {
  return (process.env.QUICKBOOKS_REPORT_TIMEZONE || 'America/Los_Angeles').trim() || 'America/Los_Angeles';
}

export function accountingMethodForPnl(): 'Accrual' | 'Cash' {
  const raw = (process.env.QUICKBOOKS_PNL_ACCOUNTING_METHOD || 'Accrual').trim().toLowerCase();
  return raw === 'cash' ? 'Cash' : 'Accrual';
}

/** YYYY-MM-DD for a UTC instant interpreted in `timeZone` (calendar date in that zone). */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** First day of the month through "today" for P&L, as YYYY-MM-DD in the report timezone. */
export function monthToDateRangeYmd(now = new Date(), timeZone = quickBooksReportTimeZone()) {
  const end = ymdInTimeZone(now, timeZone);
  const start = `${end.slice(0, 8)}01`;
  return { start, end, timeZone };
}

/**
 * End = today in report TZ; start ≈ N calendar days earlier (approximate using UTC day subtraction).
 */
export function rollingLastDaysRangeYmd(
  dayCount: number,
  now = new Date(),
  timeZone = quickBooksReportTimeZone(),
): { start: string; end: string; timeZone: string } {
  const n = Math.min(366, Math.max(1, Math.floor(dayCount)));
  const end = ymdInTimeZone(now, timeZone);
  const approx = new Date(now.getTime() - (n - 1) * 86400000);
  const start = ymdInTimeZone(approx, timeZone);
  return { start, end, timeZone };
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmdParam(raw: string | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!YMD_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/** Ensure from ≤ to and span ≤ maxDays (inclusive). Invalid query parts fall back per field. */
export function normalizePnlDateRange(
  fromRaw: string | undefined | null,
  toRaw: string | undefined | null,
  fallback: { start: string; end: string },
  maxDays = 366,
  timeZone = quickBooksReportTimeZone(),
): { start: string; end: string } {
  let from = (fromRaw ? parseYmdParam(fromRaw) : null) ?? fallback.start;
  let to = (toRaw ? parseYmdParam(toRaw) : null) ?? fallback.end;
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  const t0 = Date.parse(`${from}T12:00:00.000Z`);
  const t1 = Date.parse(`${to}T12:00:00.000Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return fallback;
  const span = Math.floor((t1 - t0) / 86400000) + 1;
  if (span <= maxDays) return { start: from, end: to };
  const newT0 = t1 - (maxDays - 1) * 86400000;
  const start = ymdInTimeZone(new Date(newT0), timeZone);
  return { start, end: to };
}

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

type ColDataCell = { value?: string };

function colDataArray(row: Record<string, unknown>): ColDataCell[] | null {
  const raw = row.ColData;
  if (!Array.isArray(raw)) return null;
  return raw as ColDataCell[];
}

function emitLine(label: string, amountRaw: string | undefined, depth: number, acc: PnlLine[]) {
  const t = label.trim();
  if (!t) return;
  acc.push({ label: t, amountCents: parseMoneyCell(amountRaw), depth });
}

/** Walk QBO ProfitAndLoss JSON Rows. */
function walkReportRows(node: unknown, depth: number, acc: PnlLine[]): void {
  if (node == null || typeof node !== 'object') return;
  const row = node as Record<string, unknown>;

  const header = row.Header as Record<string, unknown> | undefined;
  if (header && typeof header === 'object') {
    const cols = colDataArray(header);
    if (cols && cols.length >= 2) {
      const label = cols[0]?.value ?? '';
      const last = cols[cols.length - 1]?.value;
      if (label.trim()) emitLine(label, last, depth, acc);
    }
  }

  const dataCols = colDataArray(row);
  if (dataCols && dataCols.length >= 2 && row.type === 'Data') {
    emitLine(dataCols[0]?.value ?? '', dataCols[dataCols.length - 1]?.value, depth, acc);
  }

  const summary = row.Summary as Record<string, unknown> | undefined;
  if (summary && typeof summary === 'object') {
    const cols = colDataArray(summary);
    if (cols && cols.length >= 2) {
      emitLine(cols[0]?.value ?? 'Summary', cols[cols.length - 1]?.value, depth, acc);
    }
  }

  const rows = row.Rows as Record<string, unknown> | undefined;
  if (rows && typeof rows === 'object' && rows.Row != null) {
    const list = rows.Row;
    const arr = Array.isArray(list) ? list : [list];
    const nextDepth = row.type === 'Section' ? depth + 1 : depth;
    for (const child of arr) walkReportRows(child, nextDepth, acc);
  }
}

function parseProfitAndLossJson(
  body: unknown,
  accountingMethod: 'Accrual' | 'Cash',
  reportTimeZone: string,
): Omit<PnlMonthToDateResult, 'ok'> {
  const root = body as Record<string, unknown>;
  const header = (root.Header ?? {}) as Record<string, unknown>;
  const reportName = String(header.ReportName ?? 'ProfitAndLoss');
  const startPeriod = String(header.StartPeriod ?? '');
  const endPeriod = String(header.EndPeriod ?? '');
  const currency =
    (header.Currency as string | undefined)?.trim() ||
    (header.ReportBasis as string | undefined) ||
    null;

  let companyName: string | null = null;
  const opt = header.Option;
  if (Array.isArray(opt)) {
    for (const o of opt) {
      const optRow = o as Record<string, unknown>;
      if (
        String(optRow.Name ?? '') === 'NoReportData' &&
        String(optRow.Value ?? '') === 'true'
      ) {
        return {
          reportName,
          startPeriod,
          endPeriod,
          currency,
          accountingMethod,
          reportTimeZone,
          companyName: null,
          lines: [],
          netIncomeCents: null,
        };
      }
    }
  }

  const headerReportHeader = header.HeaderReport as Record<string, unknown> | undefined;
  if (headerReportHeader?.ColData && Array.isArray(headerReportHeader.ColData)) {
    const cd = headerReportHeader.ColData as { value?: string }[];
    const v = cd[0]?.value?.trim();
    if (v) companyName = v;
  }

  const lines: PnlLine[] = [];
  const rowsWrap = root.Rows as Record<string, unknown> | undefined;
  if (rowsWrap?.Row != null) {
    const list = rowsWrap.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const r of arr) walkReportRows(r, 0, lines);
  }
  const footer = root.Footer as Record<string, unknown> | undefined;
  const footerRows = footer?.Rows as Record<string, unknown> | undefined;
  if (footerRows?.Row != null) {
    const list = footerRows.Row;
    const arr = Array.isArray(list) ? list : [list];
    for (const r of arr) walkReportRows(r, 0, lines);
  }

  let netIncomeCents: number | null = null;
  for (const line of lines) {
    const l = line.label.toLowerCase();
    if (l.includes('net income') || l.includes('net operating income')) {
      netIncomeCents = line.amountCents;
    }
  }

  return {
    reportName,
    startPeriod,
    endPeriod,
    currency,
    accountingMethod,
    reportTimeZone,
    companyName,
    lines,
    netIncomeCents,
  };
}

export async function loadProfitAndLossMonthToDate(
  realmId: string,
  opts?: { now?: Date },
): Promise<PnlMonthToDateResult | PnlErrorResult> {
  const tz = quickBooksReportTimeZone();
  const { start, end } = monthToDateRangeYmd(opts?.now ?? new Date(), tz);
  return loadProfitAndLossForDateRange(realmId, start, end);
}

export async function loadProfitAndLossForDateRange(
  realmId: string,
  startYmd: string,
  endYmd: string,
): Promise<PnlMonthToDateResult | PnlErrorResult> {
  const accountingMethod = accountingMethodForPnl();
  const tz = quickBooksReportTimeZone();
  try {
    const body = await fetchProfitAndLossReport(realmId, startYmd, endYmd, { accountingMethod });
    const parsed = parseProfitAndLossJson(body, accountingMethod, tz);
    return { ok: true, ...parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
