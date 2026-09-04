/**
 * Recognising the shop's own name where a customer name is expected.
 * Shared by the inbound-lead card display and the Yelp lead classifier, so both agree on
 * what "us" looks like. Pure and credential-free.
 */

const DEFAULT_SHOP_NAME_PATTERNS = [
  'beseen',
  'beseenprint',
  'beseenprintsignanddesign',
  'beseenprintsign',
  'printsignanddesign',
];

/** The index signature keeps `process.env` assignable despite the weak-type check. */
export type ShopNameEnv = {
  INBOUND_SHOP_NAME_PATTERNS?: string | undefined;
  [key: string]: string | undefined;
};

/** Letters and digits only, so punctuation and spacing cannot defeat a comparison. */
export function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function shopNamePatterns(env: ShopNameEnv = process.env): string[] {
  const raw = env.INBOUND_SHOP_NAME_PATTERNS?.trim();
  if (!raw) return DEFAULT_SHOP_NAME_PATTERNS;
  return raw.split(',').map(compactName).filter(Boolean);
}

export function isShopPlaceholderName(name: string | null | undefined): boolean {
  const compact = compactName(name?.trim() ?? '');
  if (!compact) return false;
  return shopNamePatterns().some((p) => compact.includes(p) || p.includes(compact));
}

/**
 * Stricter than `isShopPlaceholderName`: used to decide whether a *real* business name
 * belongs to us, where a loose match would throw away another shop's message. Requires
 * six characters of overlap so a short pattern cannot match an unrelated name.
 */
export function looksLikeOwnShopName(name: string | null | undefined, patterns: readonly string[]): boolean {
  const compact = compactName(name?.trim() ?? '');
  if (compact.length < 4) return false;
  return patterns.some((p) => {
    if (p.length < 4) return false;
    const shorter = Math.min(p.length, compact.length);
    if (shorter < 6) return p === compact;
    return compact.includes(p) || p.includes(compact);
  });
}
