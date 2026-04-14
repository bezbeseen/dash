'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

function loginErrorMessage(error: string | null, allowedDomain: string): string | null {
  if (!error) return null;
  if (error === 'workspace' || error === 'AccessDenied') {
    return `Only @${allowedDomain} accounts can sign in. Try again with your work Google account.`;
  }
  if (error === 'Configuration') {
    return 'Sign-in is misconfigured. On Vercel, set NEXTAUTH_SECRET (required — without it you get NO_SECRET in logs). Also check GOOGLE_CLIENT_ID / SECRET and NEXTAUTH_URL. Open /api/integrations/env-check for details.';
  }
  if (error === 'OAuthCallback' || error === 'OAuthSignin') {
    return 'Google could not complete sign-in. Usually: add this site’s URL to Authorized redirect URIs (see /api/integrations/env-check → google.authorizedRedirectUrisChecklist) and set NEXTAUTH_URL to this site’s https URL.';
  }
  return `Sign-in failed (${error}). If redirect_uri_mismatch, register every URL from /api/integrations/env-check in Google Cloud.`;
}

export function LoginForm({ allowedDomain }: { allowedDomain: string }) {
  const params = useSearchParams();
  const error = params.get('error');
  const allowedParam = params.get('allowed');
  const label = allowedParam || allowedDomain;
  const errMsg = loginErrorMessage(error, label);

  return (
    <div className="card border rounded-3 p-4 bg-body" style={{ maxWidth: 520 }}>
      {errMsg ? (
        <div className="board-toast board-toast-error mb-3" role="alert">
          {errMsg}
        </div>
      ) : null}
      <p className="small text-body-secondary mb-3">
        Allowed accounts: <strong>@{allowedDomain}</strong>
      </p>
      <button
        className="btn btn-toolbar"
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
      >
        Sign in with Google
      </button>
      <p className="small text-body-secondary mt-3 mb-0">
        Deployments: if Google says <strong>redirect_uri_mismatch</strong>, your OAuth client must include{' '}
        <code className="detail-mono">/api/auth/callback/google</code> for this host — not only the Gmail path.
      </p>
    </div>
  );
}
