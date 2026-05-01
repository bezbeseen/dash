import { ProductionStatus } from '@prisma/client';

/** Shared formatters for ticket / job detail UI (server components). */

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
  }).format(d);
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
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: t.includes('T') ? 'short' : undefined,
    }).format(new Date(parsed));
  }
  return t;
}
