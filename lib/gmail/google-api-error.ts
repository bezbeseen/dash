/** Best-effort parse of googleapis / gaxios errors. */
export function googleApiStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const code = o.code;
    if (typeof code === 'number') return code;
    if (code === '403' || code === '401') return Number(code);
    const res = o.response as Record<string, unknown> | undefined;
    const status = res?.status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export function googleApiFirstReason(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const o = err as Record<string, unknown>;
  const errors = o.errors as Array<{ reason?: string }> | undefined;
  if (Array.isArray(errors) && errors[0]?.reason) return errors[0].reason;
  const res = o.response as { data?: { error?: { errors?: Array<{ reason?: string }> } } } | undefined;
  const nested = res?.data?.error?.errors;
  if (Array.isArray(nested) && nested[0]?.reason) return nested[0].reason;
  return undefined;
}
