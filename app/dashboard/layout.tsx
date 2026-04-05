import Link from 'next/link';
import React from 'react';
import { CheckingBalanceWidget } from '@/components/checking-balance-widget';
import { DashboardSidebarNav } from '@/components/dashboard-sidebar-nav';
import { PreserveShellScroll } from '@/components/preserve-shell-scroll';
import { GmailSidebarHint } from '@/components/gmail-sidebar-hint';
import { GmailRedirectUriHint } from '@/components/gmail-redirect-uri-hint';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="board-workspace d-flex flex-column flex-lg-row min-vh-100">
      <aside className="board-sidebar flex-shrink-0" aria-label="Workspace navigation">
        <Link href="/dashboard" className="board-sidebar-brand">
          <span className="board-sidebar-brand-mark" aria-hidden>
            D
          </span>
          <div>
            <span className="board-sidebar-brand-name">Dash</span>
            <span className="board-sidebar-brand-sub">Operations</span>
          </div>
        </Link>

        <DashboardSidebarNav />

        <GmailSidebarHint />
        <GmailRedirectUriHint />

        <CheckingBalanceWidget />

        <div className="board-sidebar-hint">
          QuickBooks-backed · statuses update from sync &amp; shop actions
        </div>
      </aside>

      <div className="board-stage flex-grow-1 min-w-0">
        <PreserveShellScroll />
        {children}
      </div>
    </div>
  );
}
