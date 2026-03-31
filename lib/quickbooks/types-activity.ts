/** QuickBooks invoice timeline (best-effort from public API — not 1:1 with QBO UI). */

export type InvoiceActivityEvent = {
  /** ISO string for chronological sort */
  sortKey: string;
  title: string;
  /** Primary timestamp (ISO or QBO date) shown under the title */
  at?: string;
  /** Secondary line(s): card, refs, account names */
  detail?: string;
  amountCents?: number;
  meta?: string;
};

export type InvoiceActivityTimeline = {
  events: InvoiceActivityEvent[];
  /** Shown under the timeline */
  notes: string[];
};
