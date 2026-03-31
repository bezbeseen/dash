import { NextRequest, NextResponse } from 'next/server';
import { importTransactionListCsv } from '@/lib/dev/qbo-transaction-list-csv';

/**
 * POST multipart/form-data, field `file` = QBO "Transaction List by Date" CSV.
 * Dev-only; isolated from /api/jobs/sync — see /dev/qbo-csv
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production.' }, { status: 403 });
  }

  /** Same host the browser used (localhost, 192.168.x.x, etc.) — avoids redirecting iPad uploads to localhost. */
  const origin = req.nextUrl.origin;

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.redirect(
        new URL(
          '/dev/qbo-csv?error=' + encodeURIComponent('Choose a CSV file first.'),
          origin,
        ),
      );
    }

    const text = await file.text();
    const result = await importTransactionListCsv(text);

    const msg = `Imported ${result.estimates} estimates and ${result.invoices} invoice rows (${result.skippedVoid} void/zero skipped).`;
    return NextResponse.redirect(
      new URL('/dev/qbo-csv?ok=1&msg=' + encodeURIComponent(msg), origin),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not parse CSV.';
    return NextResponse.redirect(new URL('/dev/qbo-csv?error=' + encodeURIComponent(message), origin));
  }
}
