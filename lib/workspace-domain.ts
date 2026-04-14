/** Google sign-in allowlist (server env). Override with GOOGLE_WORKSPACE_DOMAIN in .env / Vercel. */
export function workspaceDomain(): string {
  const raw = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase() ?? '';
  const stripped = raw.replace(/^@/, '');
  return stripped.length > 0 ? stripped : 'beseensignshop.com';
}
