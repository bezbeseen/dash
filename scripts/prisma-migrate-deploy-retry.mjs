#!/usr/bin/env node
/**
 * Run `prisma migrate deploy` with retries. Vercel + Neon often hit P1002 (advisory lock
 * timeout) when the pooler holds a session or a concurrent build runs migrate.
 *
 * Still fix the root cause: set DIRECT_URL to Neon’s non-pooler URL alongside pooled DATABASE_URL,
 * and avoid overlapping production builds.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const attempts = Math.min(10, Math.max(1, Number(process.env.PRISMA_MIGRATE_ATTEMPTS ?? '4')));
const delayMs = Math.min(120_000, Math.max(3_000, Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS ?? '15000')));

for (let i = 1; i <= attempts; i++) {
  const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });

  if (r.status === 0) {
    process.exit(0);
  }

  if (i < attempts) {
    console.error(
      `\n[migrate] Attempt ${i}/${attempts} failed (exit ${r.status ?? 'unknown'}). ` +
        `Retrying in ${delayMs / 1000}s…\n` +
        '  P1002 / pg_advisory_lock: use Neon DIRECT_URL (non-pooler), cancel duplicate deploys, or in Neon SQL:\n' +
        '  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid IN ' +
        "(SELECT pid FROM pg_locks WHERE locktype = 'advisory') AND pid <> pg_backend_pid();\n",
    );
    await setTimeout(delayMs);
  }
}

process.exit(1);
