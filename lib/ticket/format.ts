import { ProductionStatus } from '@prisma/client';
import { shopTimeZone } from '@/lib/shop-time-zone';
import { calendarDateInTimeZone } from '@/lib/todo/timezone';

/** Shared formatters for ticket / job detail UI (server components). Times show in the shop's time zone. */

export function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function labelEnum(s: string) {
  return s.replaceAll('_', ' ');
}

export function productionStatusDisplayLabel(status: ProductionStatus): string {
  if (status === ProductionStatus.DELIVERED) {
    return 'Delivered / installed';
  }
  return labelEnum(status);
}

export function fmtDetailDate(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: shopTimeZone(),
  }).format(d);
}

export function fmtShortDate(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: shopTimeZone() }).format(d);
}

/** Task due dates are calendar days: a typed yyyy-mm-dd is stored at UTC midnight, so show the UTC day. */
export function fmtDueDate(d: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** Tasks due before this are overdue: the shop's today, in the same UTC-day terms as `fmtDueDate`. */
export function pastDueCutoff(now = new Date()): Date {
  return new Date(`${calendarDateInTimeZone(now, shopTimeZone())}T00:00:00.000Z`);
}

export function fmtPlanHours(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n} h`;
}

/** Format QBO ISO-ish datetime or YYYY-MM-DD for display */
export function fmtQboWhen(raw: string | undefined): string {
  if (!raw?.trim()) return '—';
  const t = raw.trim();
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    const hasTime = t.includes('T');
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: hasTime ? 'short' : undefined,
      // A bare YYYY-MM-DD parses as UTC midnight; keep that calendar day.
      timeZone: hasTime ? shopTimeZone() : 'UTC',
    }).format(new Date(parsed));
  }
  return t;
}
