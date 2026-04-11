'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function AccountingPnlRefreshButton({ label = 'Refresh from QuickBooks' }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-toolbar btn-sm"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      {pending ? 'Refreshing...' : label}
    </button>
  );
}
