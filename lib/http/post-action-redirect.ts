/**
 * After a same-origin dashboard form POST (e.g. tasks), return the user to the submitting page.
 * Only allows `/dashboard/tasks` and `/dashboard/jobs/*` to avoid open redirects.
 */
export function postDashboardFormRedirect(
  req: Request,
  opts?: { fallbackPath?: string; jobIdFallback?: string | null },
): URL {
  const fallbackPath = opts?.fallbackPath ?? '/dashboard/tasks';
  const jobIdFallback = opts?.jobIdFallback ?? null;
  try {
    const incoming = new URL(req.url);
    const base = `${incoming.protocol}//${incoming.host}`;
    const ref = req.headers.get('referer');
    if (ref) {
      const u = new URL(ref);
      if (u.host === incoming.host) {
        const path = u.pathname;
        const allowed = path === '/dashboard/tasks' || path.startsWith('/dashboard/jobs/');
        if (allowed) {
          return new URL(`${path}${u.search}`, base);
        }
      }
    }
    if (jobIdFallback) {
      return new URL(`/dashboard/jobs/${jobIdFallback}`, base);
    }
    return new URL(fallbackPath, base);
  } catch {
    const envBase = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    if (jobIdFallback) return new URL(`/dashboard/jobs/${jobIdFallback}`, envBase);
    return new URL(fallbackPath, envBase);
  }
}

/** Build redirect URL using the incoming request host (fixes :3001 vs .env localhost:3000). */
export function postActionRedirect(req: Request, jobId: string, fallbackPath = '/dashboard/tickets'): URL {
  try {
    const incoming = new URL(req.url);
    const base = `${incoming.protocol}//${incoming.host}`;
    const ref = req.headers.get('referer') || '';
    if (ref.includes(`/dashboard/jobs/${jobId}`)) {
      return new URL(`/dashboard/jobs/${jobId}`, base);
    }
    return new URL(fallbackPath, base);
  } catch {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return new URL(fallbackPath, base);
  }
}
