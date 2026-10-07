import { shopTimeZone } from '@/lib/shop-time-zone';

/** Report / shop calendar defaults (same as QuickBooks P&L). */
export function todoListTimeZone(): string {
  return shopTimeZone();
}

/** YYYY-MM-DD in the given IANA time zone. */
export function calendarDateInTimeZone(d: Date, timeZone: string): string {
  return d.toLocaleDateString('en-CA', { timeZone });
}
