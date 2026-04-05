import Link from 'next/link';
import React from 'react';
import { DashboardSidebarNav } from '@/components/dashboard-sidebar-nav';
import { PreserveShellScroll } from '@/components/preserve-shell-scroll';
import { MaxtonDashboardEffects } from '@/components/maxton-dashboard-effects';
import { MaxtonTopHeader } from '@/components/maxton-top-header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MaxtonDashboardEffects />
      <MaxtonTopHeader />

      <aside className="sidebar-wrapper" aria-label="Workspace navigation">
        <div className="sidebar-header">
          <Link href="/dashboard" className="logo-icon text-decoration-none">
            <img src="/maxton/logo-icon.png" className="logo-img" width={45} height={45} alt="" />
          </Link>
          <div className="logo-name flex-grow-1">
            <h5 className="mb-0">
              <Link href="/dashboard" className="text-body text-decoration-none">
                Dash
              </Link>
            </h5>
          </div>
          <div className="sidebar-close">
            <span className="material-icons-outlined">close</span>
          </div>
        </div>
        <div className="sidebar-nav">
          <DashboardSidebarNav />

          <div className="px-3 pb-3">
            <p className="menu-label mb-2">About</p>
            <p className="small text-body-secondary lh-sm mb-0">
              QuickBooks-backed · statuses update from sync &amp; shop actions. Chart-of-accounts cash is on{' '}
              <Link href="/dashboard/cash" className="text-decoration-none">
                Cash &amp; banks
              </Link>
              .
            </p>
          </div>
        </div>
      </aside>

      <main className="main-wrapper">
        <div className="main-content">
          <PreserveShellScroll />
          {children}
        </div>
      </main>
    </>
  );
}
