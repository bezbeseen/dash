import type { ReactNode } from 'react';
import { QUICKBOOKS_OAUTH_CONNECT_HREF } from '@/lib/quickbooks/connect-href';

type Props = {
  className?: string;
  children: ReactNode;
};

/**
 * QuickBooks OAuth must use a full navigation (plain anchor). Client-side routing can
 * swallow the redirect to Intuit, leaving the tab spinning on /api/integrations/quickbooks/connect.
 */
export function QuickBooksConnectAnchor({ className, children }: Props) {
  return (
    <a className={className} href={QUICKBOOKS_OAUTH_CONNECT_HREF}>
      {children}
    </a>
  );
}
