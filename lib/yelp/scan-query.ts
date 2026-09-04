/**
 * Query-string flags for the Yelp email scan. GET defaults to a dry run; a present
 * `dryRun` must not be treated as truthy just because the string is non-empty (`"0"`).
 */

const WRITE_VALUES = new Set(['0', 'false', 'no', 'off']);
const DRY_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * @param defaultDryRun Used when the param is absent or blank (GET → true, write paths → false).
 */
export function parseDryRunQueryParam(
  raw: string | null | undefined,
  defaultDryRun: boolean,
): boolean {
  if (raw == null) return defaultDryRun;
  const v = raw.trim().toLowerCase();
  if (v === '') return defaultDryRun;
  if (WRITE_VALUES.has(v)) return false;
  if (DRY_VALUES.has(v)) return true;
  return true;
}
