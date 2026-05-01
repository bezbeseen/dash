/** True when caller expects JSON (e.g. fetch from dashboard modals). */
export function wantsJsonResponse(req: Request): boolean {
  const accept = req.headers.get('accept') ?? '';
  return accept.includes('application/json');
}
