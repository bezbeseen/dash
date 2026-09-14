import { headers } from 'next/headers';
import { Suspense } from 'react';
import { workspaceDomain } from '@/lib/workspace-domain';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const allowedDomain = workspaceDomain();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const origin = `${proto}://${host}`.replace(/\/+$/, '');
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const nextAuthOrigin = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Sign in</h1>
          <p className="board-topbar-sub">Use your Google Workspace account to access Dash.</p>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <Suspense
          fallback={
            <div className="card border rounded-3 p-4 bg-body" style={{ maxWidth: 520 }}>
              <p className="small text-body-secondary mb-0">Loading…</p>
            </div>
          }
        >
          <LoginForm
            allowedDomain={allowedDomain}
            localOrigin={isLocal ? origin : null}
            authCallbackUrl={`${(nextAuthOrigin || origin)}/api/auth/callback/google`}
            nextAuthOrigin={nextAuthOrigin || null}
          />
        </Suspense>
      </div>
    </div>
  );
}
