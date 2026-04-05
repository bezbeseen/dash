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
