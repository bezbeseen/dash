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

function exitIfNeonPoolerMisconfigured() {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  const direct = process.env.DIRECT_URL?.trim() ?? '';
  if (!url || !/-pooler\./i.test(url)) {
    return;
  }
  if (!direct || /-pooler\./i.test(direct)) {
    console.error(
      '\n[migrate] DATABASE_URL uses Neon’s pooler host (-pooler), but DIRECT_URL must be the\n' +
        '  *direct* connection (same branch, host without "-pooler"). Copy it from Neon → Connection details.\n' +
        '  If DIRECT_URL is missing or still pooled, `prisma migrate deploy` usually fails with P1002.\n' +
        '  → Local: fix `.env`. Vercel: set both env vars for Production (and Preview if used).\n',
    );
    process.exit(1);
  }
}

exitIfNeonPoolerMisconfigured();

const attempts = Math.min(10, Math.max(1, Number(process.env.PRISMA_MIGRATE_ATTEMPTS ?? '4')));
const delayMs = Math.min(120_000, Math.max(3_000, Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS ?? '15000')));

/**
 * Neon + `migrate deploy` often hits P1002 on `pg_advisory_lock` even with a correct DIRECT_URL
 * (stale pooler sessions, cold start, or lock contention). Prisma supports disabling the lock for
 * deploy when you accept serialization risk: avoid overlapping `migrate deploy` runs (e.g. two Vercel builds).
 *
 * On Vercel we default to disabling; opt into strict locking with PRISMA_MIGRATE_STRICT_ADVISORY_LOCK=1.
 * Override anytime with PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=0 (or unset and strict on Vercel).
 */
function migrateEnv() {
  const env = { ...process.env };
  const strict = process.env.PRISMA_MIGRATE_STRICT_ADVISORY_LOCK === '1';
  const onVercel = process.env.VERCEL === '1';
  if (!strict && onVercel && env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK == null) {
    env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = '1';
    if (!process.env.PRISMA_MIGRATE_SILENT_DISABLE_LOCK) {
      console.error(
        '[migrate] Using PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 on Vercel (P1002 mitigation). ' +
          'Set PRISMA_MIGRATE_STRICT_ADVISORY_LOCK=1 and fix DIRECT_URL / stuck locks if you need strict locking.\n',
      );
    }
  }
  return env;
}

for (let i = 1; i <= attempts; i++) {
  const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: migrateEnv(),
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
