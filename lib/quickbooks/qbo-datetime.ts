/** Parse QuickBooks API ISO datetime (e.g. MetaData.CreateTime). */
export function parseQboDateTime(iso?: string): Date | undefined {
  if (!iso?.trim()) return undefined;
  const t = Date.parse(iso.trim());
  if (Number.isNaN(t)) return undefined;
  return new Date(t);
}
