import { Suspense } from 'react';
import { workspaceDomain } from '@/lib/workspace-domain';
import { LoginForm } from './login-form';

export default function LoginPage() {
  const allowedDomain = workspaceDomain();
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
          <LoginForm allowedDomain={allowedDomain} />
        </Suspense>
      </div>
    </div>
  );
}
