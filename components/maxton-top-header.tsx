'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export function MaxtonTopHeader() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;

  return (
    <header className="top-header">
      <nav className="navbar navbar-expand w-100 align-items-center gap-4">
        <div className="btn-toggle">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              document.body.classList.toggle('toggled');
            }}
            aria-label="Toggle sidebar"
          >
            <i className="material-icons-outlined">menu</i>
          </a>
        </div>
        <div className="search-bar flex-grow-1 d-none d-md-block" aria-hidden />
        <div className="ms-auto d-flex align-items-center gap-3">
          <div className="text-body-secondary small d-none d-md-block">Dash / Operations</div>
          {status === 'authenticated' ? (
            <div className="d-flex align-items-center gap-2">
              {email ? <span className="small text-body-secondary detail-mono">{email}</span> : null}
              <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => signIn('google')}>
              Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
