import { calendarDateInTimeZone, todoListTimeZone } from '@/lib/todo/timezone';

export type MonthCell = {
  ymd: string;
  day: number;
  inMonth: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((p) => Number(p));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function shiftYearMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function parseYearMonthParam(
  raw: string | undefined,
  timeZone: string = todoListTimeZone(),
  now: Date = new Date(),
): { year: number; month: number } {
  const m = raw?.trim().match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const ymd = calendarDateInTimeZone(now, timeZone);
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}

function weekdaySunday0(ymd: string, timeZone: string): number {
  const [y, m, d] = ymd.split('-').map((p) => Number(p));
  const utc = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  const w = utc.toLocaleDateString('en-US', { timeZone, weekday: 'short' });
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
  return idx >= 0 ? idx : 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildMonthGrid(year: number, month: number, timeZone: string): MonthCell[] {
  const days = daysInMonth(year, month);
  const firstYmd = `${year}-${pad2(month)}-01`;
  const lead = weekdaySunday0(firstYmd, timeZone);
  const cells: MonthCell[] = [];
  const prev = shiftYearMonth(year, month, -1);
  const prevDays = daysInMonth(prev.year, prev.month);
  for (let i = lead; i > 0; i -= 1) {
    const day = prevDays - i + 1;
    cells.push({ ymd: `${prev.year}-${pad2(prev.month)}-${pad2(day)}`, day, inMonth: false });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({ ymd: `${year}-${pad2(month)}-${pad2(day)}`, day, inMonth: true });
  }
  const next = shiftYearMonth(year, month, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({
      ymd: `${next.year}-${pad2(next.month)}-${pad2(nextDay)}`,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }
  return cells;
}

export function monthTitle(year: number, month: number, timeZone: string): string {
  const utc = new Date(Date.UTC(year, month - 1, 15, 17, 0, 0));
  return utc.toLocaleDateString('en-US', { timeZone, month: 'long', year: 'numeric' });
}
