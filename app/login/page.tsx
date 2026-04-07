'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-titles">
          <h1 className="board-topbar-title">Sign in</h1>
          <p className="board-topbar-sub">Use your Google Workspace account to access Dash.</p>
        </div>
      </header>

      <div className="flex-grow-1 overflow-auto px-3 px-md-4 pb-5" style={{ minHeight: 0 }}>
        <div className="card border rounded-3 p-4 bg-body" style={{ maxWidth: 520 }}>
          <p className="small text-body-secondary mb-3">
            Allowed accounts: <strong>@beseensignshop.com</strong>
          </p>
          <button
            className="btn btn-toolbar"
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

