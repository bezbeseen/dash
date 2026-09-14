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

export function LoginForm({
  allowedDomain,
  localOrigin = null,
  authCallbackUrl,
  nextAuthOrigin = null,
}: {
  allowedDomain: string;
  localOrigin?: string | null;
  authCallbackUrl: string;
  nextAuthOrigin?: string | null;
}) {
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
        className="btn btn-primary"
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
      >
        Sign in with Google
      </button>
      {localOrigin ? (
        <div className="alert alert-light border small mt-3 mb-0" role="note">
          <p className="fw-semibold mb-2">Local preview</p>
          <p className="mb-2">
            This machine is already on <a href={localOrigin}>{localOrigin}</a> via{' '}
            <code className="detail-mono">npm run dev</code>. You do not need to deploy to Vercel to try UI
            changes — only Google must allow this host again.
          </p>
          {nextAuthOrigin && nextAuthOrigin !== localOrigin ? (
            <p className="mb-2">
              <strong>NEXTAUTH_URL</strong> is <code className="detail-mono">{nextAuthOrigin}</code>, which is
              not this tab. Set it to <code className="detail-mono">{localOrigin}</code> in <code>.env</code>{' '}
              and restart <code className="detail-mono">npm run dev</code>.
            </p>
          ) : null}
          <p className="mb-2">
            If Google says <strong>redirect_uri_mismatch</strong>, add these on the same OAuth Web client as
            Vercel (APIs &amp; Services → Credentials). Keep the Vercel URLs — just put localhost back:
          </p>
          <ul className="mb-2 ps-3">
            <li>
              Authorized JavaScript origins: <code className="detail-mono">{localOrigin}</code>
            </li>
            <li>
              Authorized redirect URIs: <code className="detail-mono">{authCallbackUrl}</code>
            </li>
          </ul>
          <p className="mb-0">
            Checklist JSON: <a href="/api/integrations/env-check">/api/integrations/env-check</a>
          </p>
        </div>
      ) : (
        <p className="small text-body-secondary mt-3 mb-0">
          If Google says <strong>redirect_uri_mismatch</strong>, add{' '}
          <code className="detail-mono">{authCallbackUrl}</code> to the OAuth Web client — not only the Gmail
          path.
        </p>
      )}
    </div>
  );
}
