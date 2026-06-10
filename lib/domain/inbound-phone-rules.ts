/**
 * Label recurring inbound caller numbers (e.g. internal sales line) for triage and bulk dismiss.
 *
 * Env `INBOUND_CALLER_PHONE_RULES` — JSON array:
 * `[{"id":"sales","label":"Sales","digits":"166920","autoThin":true}]`
 *
 * `digits` is matched as a substring of the normalized phone (digits only, last 10 for US).
 */

export type InboundPhoneRule = {
  id: string;
  label: string;
  digits: string;
  autoThin: boolean;
};

const DEFAULT_RULES: InboundPhoneRule[] = [
  { id: 'sales', label: 'Sales', digits: '166920', autoThin: true },
];

function parseRulesJson(raw: string): InboundPhoneRule[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: InboundPhoneRule[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      const label = typeof r.label === 'string' ? r.label.trim() : '';
      const digits = typeof r.digits === 'string' ? r.digits.replace(/\D/g, '') : '';
      if (!id || !label || !digits) continue;
      out.push({
        id,
        label,
        digits,
        autoThin: r.autoThin !== false,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function loadInboundPhoneRules(): InboundPhoneRule[] {
  const raw = process.env.INBOUND_CALLER_PHONE_RULES?.trim();
  if (!raw) return DEFAULT_RULES;
  return parseRulesJson(raw) ?? DEFAULT_RULES;
}

/** Strip to digits; US numbers use last 10 when longer. */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length >= 10) d = d.slice(-10);
  return d.length >= 7 ? d : null;
}

export function formatPhoneDisplay(digits: string): string {
  const d = normalizePhoneDigits(digits);
  if (!d) return digits.trim();
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return d;
}

export function matchInboundPhoneRule(
  phoneDigits: string | null | undefined,
  rules: InboundPhoneRule[] = loadInboundPhoneRules(),
): InboundPhoneRule | null {
  const norm = normalizePhoneDigits(phoneDigits ?? '');
  if (!norm) return null;
  for (const rule of rules) {
    const needle = rule.digits.replace(/\D/g, '');
    if (needle && norm.includes(needle)) return rule;
  }
  return null;
}
