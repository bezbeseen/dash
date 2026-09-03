'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isWorkflowRoute } from '@/lib/domain/workflow-tabs';

/** Yelp for Business (listings, ads, inbox) — owner dashboard. */
const YELP_BUSINESS_URL = process.env.NEXT_PUBLIC_YELP_URL || 'https://biz.yelp.com';
/**
 * Metrics / performance (page visits, leads, etc.). If Yelp opens Home first, open your metrics view,
 * copy the address bar, and set NEXT_PUBLIC_YELP_INSIGHTS_URL.
 */
const YELP_INSIGHTS_URL =
  process.env.NEXT_PUBLIC_YELP_INSIGHTS_URL || 'https://biz.yelp.com';
/** Business hub (listings, edit profile) — not the marketing homepage. */
const GOOGLE_BUSINESS_URL =
  process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_URL || 'https://business.google.com/dashboard';
/**
 * Performance / insights. Google has no single public URL for every account; open Performance in GBP,
 * copy the address bar, and set NEXT_PUBLIC_GOOGLE_BUSINESS_INSIGHTS_URL in .env for a direct jump.
 */
const GOOGLE_BUSINESS_INSIGHTS_URL =
  process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_INSIGHTS_URL || 'https://business.google.com/dashboard';
const FACEBOOK_URL = process.env.NEXT_PUBLIC_FACEBOOK_URL || 'https://www.facebook.com/';
const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/';

const VENDOR_LINKS = [
  { title: 'B2Sign', url: 'https://www.b2sign.com/', icon: 'print' },
  { title: 'SF Sign Supply', url: 'https://www.sfsignsupply.com/', icon: 'inventory_2' },
  { title: 'Montroy', url: 'https://www.montroy.com/', icon: 'category' },
  { title: 'Signs365', url: 'https://www.signs365.com/#home', icon: 'store' },
] as const;

export function DashboardSidebarNav() {
  const pathname = usePathname() ?? '';
  const dashboardActive = pathname === '/dashboard';
  const activityActive = pathname === '/dashboard/activity' || pathname.startsWith('/dashboard/activity/');
  const accountingActive = pathname === '/dashboard/accounting' || pathname.startsWith('/dashboard/accounting/');
  const cashActive = pathname === '/dashboard/cash' || pathname.startsWith('/dashboard/cash/');
  const gbpMetricsActive = pathname === '/dashboard/gbp' || pathname.startsWith('/dashboard/gbp/');
  const webAnalyticsActive = pathname === '/dashboard/analytics' || pathname.startsWith('/dashboard/analytics/');
  const settingsActive = pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/');
  const workflowActive = isWorkflowRoute(pathname);
  const assistantActive = pathname === '/dashboard/assistant';

  return (
    <ul className="metismenu" id="sidenav">
      <li className="menu-label">Menu</li>
      <li className={dashboardActive ? 'mm-active' : ''}>
        <Link href="/dashboard">
          <div className="parent-icon">
            <i className="material-icons-outlined">dashboard</i>
          </div>
          <div className="menu-title">Dashboard</div>
        </Link>
      </li>
      <li className={activityActive ? 'mm-active' : ''}>
        <Link href="/dashboard/activity">
          <div className="parent-icon">
            <i className="material-icons-outlined">history</i>
          </div>
          <div className="menu-title">Activity</div>
        </Link>
      </li>
      <li className={workflowActive ? 'mm-active' : ''}>
        <Link href="/dashboard/tickets">
          <div className="parent-icon">
            <i className="material-icons-outlined">confirmation_number</i>
          </div>
          <div className="menu-title">Tickets</div>
        </Link>
      </li>
      <li className={assistantActive ? 'mm-active' : ''}>
        <Link href="/dashboard/assistant">
          <div className="parent-icon">
            <i className="material-icons-outlined">smart_toy</i>
          </div>
          <div className="menu-title">Dash Manager</div>
        </Link>
      </li>

      <li className="menu-label">Money</li>
      <li className={accountingActive ? 'mm-active' : ''}>
        <Link href="/dashboard/accounting">
          <div className="parent-icon">
            <i className="material-icons-outlined">account_balance</i>
          </div>
          <div className="menu-title">Accounting</div>
        </Link>
      </li>
      <li className={cashActive ? 'mm-active' : ''}>
        <Link href="/dashboard/cash">
          <div className="parent-icon">
            <i className="material-icons-outlined">account_balance_wallet</i>
          </div>
          <div className="menu-title">Cash &amp; banks</div>
        </Link>
      </li>

      <li className={gbpMetricsActive ? 'mm-active' : ''}>
        <Link href="/dashboard/gbp">
          <div className="parent-icon">
            <i className="material-icons-outlined">insights</i>
          </div>
          <div className="menu-title">GBP metrics</div>
        </Link>
      </li>
      <li className={webAnalyticsActive ? 'mm-active' : ''}>
        <Link href="/dashboard/analytics">
          <div className="parent-icon">
            <i className="material-icons-outlined">trending_up</i>
          </div>
          <div className="menu-title">Web analytics</div>
        </Link>
      </li>

      <li className="menu-label">Vendors</li>
      {VENDOR_LINKS.map((vendor) => (
        <li key={vendor.url}>
          <a href={vendor.url} target="_blank" rel="noopener noreferrer">
            <div className="parent-icon">
              <i className="material-icons-outlined">{vendor.icon}</i>
            </div>
            <div className="menu-title">{vendor.title}</div>
          </a>
        </li>
      ))}

      <li className="menu-label">Integrations</li>
      <li>
        <a href={YELP_BUSINESS_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">star</i>
          </div>
          <div className="menu-title">Yelp Business</div>
        </a>
      </li>
      <li>
        <a href={YELP_INSIGHTS_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">bar_chart</i>
          </div>
          <div className="menu-title">Yelp insights</div>
        </a>
      </li>
      <li>
        <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">storefront</i>
          </div>
          <div className="menu-title">Google Business</div>
        </a>
      </li>
      <li>
        <a href={GOOGLE_BUSINESS_INSIGHTS_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">bar_chart</i>
          </div>
          <div className="menu-title">GBP insights</div>
        </a>
      </li>
      <li>
        <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">public</i>
          </div>
          <div className="menu-title">Facebook</div>
        </a>
      </li>
      <li>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          <div className="parent-icon">
            <i className="material-icons-outlined">photo_camera</i>
          </div>
          <div className="menu-title">Instagram</div>
        </a>
      </li>

      <li className={settingsActive ? 'mm-active mt-3' : 'mt-3'}>
        <Link href="/dashboard/settings">
          <div className="parent-icon">
            <i className="material-icons-outlined">settings</i>
          </div>
          <div className="menu-title">Settings</div>
        </Link>
      </li>
    </ul>
  );
}
