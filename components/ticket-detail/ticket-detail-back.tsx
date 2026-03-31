import Link from 'next/link';

export function TicketDetailBack() {
  return (
    <div className="detail-back">
      <Link href="/dashboard" className="btn btn-ghost">
        ← Board
      </Link>
    </div>
  );
}
