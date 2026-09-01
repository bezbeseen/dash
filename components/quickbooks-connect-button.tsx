'use client';

import { useState } from 'react';
import { QUICKBOOKS_OAUTH_CONNECT_HREF } from '@/lib/quickbooks/connect-href';

type Props = {
  className?: string;
  children: React.ReactNode;
};

export function QuickBooksConnectButton({ className, children }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        window.location.assign(QUICKBOOKS_OAUTH_CONNECT_HREF);
      }}
    >
      {busy ? 'Opening QuickBooks…' : children}
    </button>
  );
}
