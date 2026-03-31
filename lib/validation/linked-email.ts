/** Normalize optional URL: allow https?, mailto — reject junk. */
export function normalizeOptionalLinkUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) {
    return s;
  }
  return null;
}
