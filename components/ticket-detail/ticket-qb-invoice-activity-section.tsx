import type { InvoiceActivityTimeline } from '@/lib/quickbooks/types-activity';
import { fmtQboWhen, fmtUsd } from '@/lib/ticket/format';

export type InvoiceActivitySkipReason = 'no_qbo_docs' | 'synthetic_id' | 'no_realm';

type Props = {
  sectionId?: string;
  timeline: InvoiceActivityTimeline | null;
  errorText: string | null;
  skippedReason: InvoiceActivitySkipReason | null;
};

export function TicketQuickBooksInvoiceActivitySection({
  sectionId,
  timeline,
  errorText,
  skippedReason,
}: Props) {
  return (
    <section id={sectionId} className="ticket-detail-panel">
      <h2 className="detail-section-title">QuickBooks activity</h2>
      <p className="meta ticket-doc-note" style={{ marginBottom: 16 }}>
        Estimate and invoice milestones, plus payments and deposits from the QuickBooks API. Some lines in the QBO UI
        (email opens, exact send time, &quot;viewed&quot; counts) are not available via API — compare with QuickBooks
        for the full story.
      </p>

      {skippedReason === 'no_qbo_docs' ? (
        <p className="meta">No QuickBooks estimate or invoice on this ticket yet — activity will appear after one is linked.</p>
      ) : null}
      {skippedReason === 'synthetic_id' ? (
        <p className="meta">
          This ticket uses a <strong>local / CSV preview</strong> invoice id (not a real QuickBooks invoice). Connect
          and sync real invoices to see invoice payment activity here. Estimate activity still loads when a real
          estimate is linked.
        </p>
      ) : null}
      {skippedReason === 'no_realm' ? (
        <p className="meta">Connect QuickBooks and sync so we can load activity for this company.</p>
      ) : null}

      {errorText ? (
        <p className="board-toast board-toast-error" style={{ marginBottom: 12 }}>
          {errorText}
        </p>
      ) : null}

      {timeline && timeline.events.length > 0 ? (
        <ol className="ticket-qb-timeline">
          {timeline.events.map((ev, i) => (
            <li key={`${ev.sortKey}-${i}`} className="ticket-qb-timeline-item">
              <div className="ticket-qb-timeline-title">{ev.title}</div>
              {ev.at ? <div className="ticket-qb-timeline-at">{fmtQboWhen(ev.at)}</div> : null}
              {ev.detail ? <div className="ticket-qb-timeline-detail">{ev.detail}</div> : null}
              {ev.amountCents != null && ev.amountCents > 0 ? (
                <div className="ticket-qb-timeline-amount">{fmtUsd(ev.amountCents)}</div>
              ) : null}
              {ev.meta ? <div className="ticket-qb-timeline-meta meta">{ev.meta}</div> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {timeline && timeline.events.length === 0 && !skippedReason && !errorText ? (
        <p className="meta">No activity lines returned from QuickBooks for this ticket yet.</p>
      ) : null}

      {timeline?.notes?.length ? (
        <ul className="ticket-qb-timeline-notes meta">
          {timeline.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
