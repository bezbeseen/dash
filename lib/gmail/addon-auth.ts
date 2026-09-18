import crypto from 'crypto';

export function gmailAddonSecret(): string | null {
  const s = process.env.GMAIL_ADDON_SECRET?.trim();
  return s || null;
}

function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Bearer token or X-Dash-Addon-Secret, same value as Script Property DASH_ADDON_SECRET. */
export function gmailAddonAuthorized(req: Request, secret: string): boolean {
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = req.headers.get('x-dash-addon-secret')?.trim() ?? '';
  return secretsEqual(bearer, secret) || secretsEqual(header, secret);
}
