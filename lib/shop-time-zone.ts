/** IANA zone the shop works in. Reports, calendars, cards and tickets show dates in it (servers run in UTC). */
export function shopTimeZone(): string {
  return (process.env.QUICKBOOKS_REPORT_TIMEZONE || 'America/Los_Angeles').trim() || 'America/Los_Angeles';
}
