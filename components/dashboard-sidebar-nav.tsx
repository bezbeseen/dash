'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardSidebarNav() {
  const pathname = usePathname() ?? '';
  const boardActive = pathname === '/dashboard';
  const doneActive = pathname === '/dashboard/done' || pathname.startsWith('/dashboard/done/');

  return (
    <nav className="board-sidebar-nav">
      <p className="board-sidebar-section-label">Main</p>
      <Link
        href="/dashboard"
        className={`board-sidebar-link${boardActive ? ' board-sidebar-link-active' : ''}`}
      >
        <BoardIcon />
        Production board
      </Link>
      <Link
        href="/dashboard/done"
        className={`board-sidebar-link${doneActive ? ' board-sidebar-link-active' : ''}`}
      >
        <DoneIcon />
        Done
      </Link>
    </nav>
  );
}

function BoardIcon() {
  return (
    <svg className="board-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm9 0a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V5zM4 16a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3zm9 0a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-3z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function DoneIcon() {
  return (
    <svg className="board-sidebar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.25 12.25L10.5 14.5L15.75 9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
