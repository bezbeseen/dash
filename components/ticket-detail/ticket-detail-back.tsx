import Link from 'next/link';

export function TicketDetailBack({ customerHref }: { customerHref?: string }) {
  return (
    <div className="detail-back d-flex flex-wrap gap-2">
      <Link href="/dashboard/tickets" className="btn btn-sm btn-outline-secondary">
        ← Board
      </Link>
      {customerHref ? (
        <Link href={customerHref as never} className="btn btn-sm btn-outline-secondary">
          Customer
        </Link>
      ) : null}
    </div>
  );
}
