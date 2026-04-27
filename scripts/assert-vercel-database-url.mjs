/**
 * Fail fast on Vercel when DATABASE_URL is missing or still localhost.
 * Prisma would otherwise error with P1001 during `prisma migrate deploy`.
 */
const url = process.env.DATABASE_URL?.trim() ?? '';

if (process.env.VERCEL !== '1') {
  process.exit(0);
}

if (!url) {
  console.error(
    '\n[build] DATABASE_URL is not set on Vercel.\n' +
      '  → Vercel → Project → Settings → Environment Variables\n' +
      '  → Add DATABASE_URL (and DIRECT_URL) from Neon, save, redeploy.\n',
  );
  process.exit(1);
}

if (/\blocalhost\b|127\.0\.0\.1|::1\b/.test(url)) {
  console.error(
    '\n[build] DATABASE_URL still points at localhost on Vercel.\n' +
      '  Vercel cannot reach your laptop. Replace it with your Neon connection string\n' +
      '  (same for DIRECT_URL unless Neon gave you a separate direct URL).\n' +
      '  → Vercel → Settings → Environment Variables → edit for Production and Preview\n' +
      '  → Save → Redeploy\n',
  );
  process.exit(1);
}

process.exit(0);
