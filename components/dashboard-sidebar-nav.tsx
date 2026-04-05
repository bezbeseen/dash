'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardSidebarNav() {
  const pathname = usePathname() ?? '';
  const boardActive = pathname === '/dashboard';
  const doneActive = pathname === '/dashboard/done' || pathname.startsWith('/dashboard/done/');
  const designActive = pathname.startsWith('/dashboard/dev/design');
  const showDesignLab = process.env.NODE_ENV === 'development';

  return (
    <ul className="metismenu" id="sidenav">
      <li className="menu-label">Main</li>
      <li className={boardActive ? 'mm-active' : ''}>
        <Link href="/dashboard">
          <div className="parent-icon">
            <i className="material-icons-outlined">dashboard</i>
          </div>
          <div className="menu-title">Production board</div>
        </Link>
      </li>
      <li className={doneActive ? 'mm-active' : ''}>
        <Link href="/dashboard/done">
          <div className="parent-icon">
            <i className="material-icons-outlined">task_alt</i>
          </div>
          <div className="menu-title">Done</div>
        </Link>
      </li>
      {showDesignLab ? (
        <>
          <li className="menu-label">Design</li>
          <li className={designActive ? 'mm-active' : ''}>
            <Link href="/dashboard/dev/design">
              <div className="parent-icon">
                <i className="material-icons-outlined">palette</i>
              </div>
              <div className="menu-title">Design lab</div>
            </Link>
          </li>
        </>
      ) : null}
    </ul>
  );
}
