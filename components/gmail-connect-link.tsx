import type { ReactNode } from 'react';
import { GMAIL_OAUTH_CONNECT_HREF } from '@/lib/gmail/connect-href';

type Props = {
  className?: string;
  children: ReactNode;
};

/**
 * Gmail OAuth must use a full navigation (plain anchor). Next.js `<Link>` client navigation
 * can swallow the redirect to accounts.google.com, so the button appears to do nothing.
 */
export function GmailConnectAnchor({ className, children }: Props) {
  return (
    <a className={className} href={GMAIL_OAUTH_CONNECT_HREF}>
      {children}
    </a>
  );
}
