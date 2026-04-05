/**
 * Import a QuickBooks "Transaction List by Date" CSV into the same PostgreSQL DB
 * as the app (`DATABASE_URL` in `.env`).
 *
 * Usage:
 *   npm run import-csv -- "/path/to/Transaction List by Date.csv"
 *   npm run import-csv   # uses ./Be Seen LLC_Transaction List by Date.csv if it exists
 */

import fs from 'fs';
import path from 'path';
import { BoardStatus } from '@prisma/client';
import { importTransactionListCsv } from '../lib/dev/qbo-transaction-list-csv';
import { prisma } from '../lib/db/prisma';

async function main() {
  const arg = process.argv[2];
  const fallback = path.join(process.cwd(), 'Be Seen LLC_Transaction List by Date.csv');
  const file = arg && fs.existsSync(arg) ? arg : !arg && fs.existsSync(fallback) ? fallback : null;

  if (!file) {
    console.error('Usage: npm run import-csv -- <path-to-transaction-list.csv>');
    console.error('(Or add Be Seen LLC_Transaction List by Date.csv in the project root and run without args.)');
    process.exit(1);
  }

  const text = fs.readFileSync(file, 'utf8');
  const result = await importTransactionListCsv(text);
  console.log('Imported:', result);
  const visible = await prisma.job.count({
    where: { archivedAt: null, boardStatus: { not: BoardStatus.REQUESTED } },
  });
  console.log(`Jobs visible on /dashboard (not Lead): ${visible}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
