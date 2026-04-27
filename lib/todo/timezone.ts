/** Report / shop calendar defaults (same as QuickBooks P&L). */
export function todoListTimeZone(): string {
  return (process.env.QUICKBOOKS_REPORT_TIMEZONE || 'America/Los_Angeles').trim() || 'America/Los_Angeles';
}

/** YYYY-MM-DD in the given IANA time zone. */
export function calendarDateInTimeZone(d: Date, timeZone: string): string {
  return d.toLocaleDateString('en-CA', { timeZone });
}
