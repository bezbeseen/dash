import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = {
  searchParams: Promise<{
    ok?: string;
    msg?: string;
    error?: string;
  }>;
};

/** Isolated dev-only page — does not change the main dashboard. */
export default async function DevQboCsvPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const q = await searchParams;
  const ok = q.ok === '1';
  const msg = q.msg ? decodeURIComponent(q.msg) : null;
  const error = q.error ? decodeURIComponent(q.error) : null;

  return (
    <div className="board-page" style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/dashboard/tickets" className="btn btn-toolbar btn-toolbar-muted">
          ← Back to board
        </Link>
      </p>
      <h1 style={{ fontSize: '1.35rem', marginBottom: 8 }}>Dev: QBO CSV preview</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
        Local-only. Upload a QuickBooks <strong>Transaction List by Date</strong> export to seed
        familiar-looking tickets. Core <strong>Sync from QuickBooks</strong> and API routes are
        unchanged — this uses <code>lib/dev/</code> and synthetic IDs (<code>csv-est-…</code> /{' '}
        <code>csv-inv-…</code>).
      </p>
      <div
        className="board-toast board-toast-ok"
        style={{ marginBottom: 20, textAlign: 'left', lineHeight: 1.5 }}
      >
        <strong>Having a CSV in the project folder does not load it.</strong> You must choose the file
        here and click <strong>Import into local DB</strong>. Data is written to the same PostgreSQL DB as
        the rest of the app (see <code>DATABASE_URL</code> in <code>.env</code>). Then open{' '}
        <Link href="/dashboard/tickets">Tickets</Link> — board
        do not list on this page. Use <code>npm run import-csv</code> from a terminal if the browser
        upload misbehaves.
      </div>

      {error ? (
        <div className="board-toast board-toast-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}
      {ok && msg ? (
        <div className="board-toast board-toast-ok" style={{ marginBottom: 16 }}>
          {msg}{' '}
          <Link href="/dashboard/tickets" style={{ textDecoration: 'underline' }}>
            Open tickets
          </Link>{' '}
          to see the new tickets.
        </div>
      ) : null}

      <form
        action="/api/dev/qbo-transaction-list-csv"
        method="post"
        encType="multipart/form-data"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <label style={{ fontSize: 14 }}>
          CSV file
          <input name="file" type="file" accept=".csv,text/csv" required style={{ display: 'block', marginTop: 8 }} />
        </label>
        <button type="submit" className="btn btn-toolbar">
          Import into local DB
        </button>
      </form>
    </div>
  );
}
