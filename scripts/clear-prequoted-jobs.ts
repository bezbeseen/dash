#!/usr/bin/env npx tsx
/**
 * Deletes every job with boardStatus REQUESTED (Pre-quote tickets).
 * Does not touch QuickBooks tokens, Gmail connections, etc.
 *
 * DATABASE_URL: set in the environment or in a `.env` file in the project root.
 *
 *   npx tsx scripts/clear-prequoted-jobs.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, BoardStatus } from '@prisma/client';

function loadDotEnv() {
  if (process.env.DATABASE_URL?.trim()) return;
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set. Add it to .env or export it (e.g. from Vercel → Postgres).');
    process.exit(1);
  }
  const result = await prisma.job.deleteMany({
    where: { boardStatus: BoardStatus.REQUESTED },
  });
  console.log(`Deleted ${result.count} pre-quote job(s) (boardStatus REQUESTED).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
