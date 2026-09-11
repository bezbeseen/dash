/**
 * Same-origin dashboard path only. Used after integration POSTs so the user
 * lands back on Tickets, Settings, or a ticket — never an open redirect.
 */
export function safeDashboardReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return null;
  if (!trimmed.startsWith('/dashboard') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://') || trimmed.includes('..')) return null;
  const pathname = trimmed.split('?')[0] ?? '';
  if (pathname !== '/dashboard' && !pathname.startsWith('/dashboard/')) return null;
  return pathname.length > 0 ? pathname : null;
}
