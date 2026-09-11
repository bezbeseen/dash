import Link from 'next/link';

export function TicketDetailBack() {
  return (
    <div className="detail-back">
      <Link href="/dashboard/tickets" className="btn btn-sm btn-outline-secondary">
        ← Board
      </Link>
    </div>
  );
}
