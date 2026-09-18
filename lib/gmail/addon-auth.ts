import crypto from 'crypto';

function unwrapSecret(value: string | undefined | null): string {
  let s = String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Vercel must set GMAIL_ADDON_SECRET (not DASH_ADDON_SECRET).
 * Apps Script keeps the property name DASH_ADDON_SECRET; the values must match.
 * DASH_ADDON_SECRET is a local-only alias so .env can use either name.
 */
export function gmailAddonSecret(): string | null {
  const fromGmail = unwrapSecret(process.env.GMAIL_ADDON_SECRET);
  if (fromGmail) return fromGmail;
  const fromDash = unwrapSecret(process.env.DASH_ADDON_SECRET);
  return fromDash || null;
}

/** SHA-256 then timingSafeEqual so unequal UTF-8 lengths never throw. */
function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function tokenFromAuthorization(auth: string | null): string {
  const raw = unwrapSecret(auth);
  if (!raw) return '';
  const bearer = raw.match(/^bearer\s+(.+)$/i);
  return bearer ? unwrapSecret(bearer[1]) : raw;
}

function tokenFromBody(body: Record<string, unknown> | null | undefined): string {
  if (!body) return '';
  for (const key of ['addonSecret', 'addon_secret']) {
    const v = body[key];
    if (typeof v === 'string' && unwrapSecret(v)) return unwrapSecret(v);
  }
  return '';
}

/**
 * Accepts Authorization Bearer (or raw), X-Dash-Addon-Secret, or JSON addonSecret.
 * Same value as Apps Script property DASH_ADDON_SECRET / Vercel GMAIL_ADDON_SECRET.
 */
export function gmailAddonAuthorized(
  req: Request,
  secret: string,
  body?: Record<string, unknown> | null,
): boolean {
  const expected = unwrapSecret(secret);
  const candidates = [
    tokenFromAuthorization(req.headers.get('authorization')),
    unwrapSecret(req.headers.get('x-dash-addon-secret')),
    tokenFromBody(body),
  ];
  return candidates.some((provided) => secretsEqual(provided, expected));
}
