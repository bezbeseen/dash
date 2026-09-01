'use client';

import { useState } from 'react';

type Props = {
  action?: string;
  returnTo: string;
  className?: string;
  children: React.ReactNode;
};

export function QuickBooksSyncForm({
  action = '/api/jobs/sync',
  returnTo,
  className = 'btn btn-toolbar',
  children,
}: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={action}
      method="post"
      onSubmit={() => setBusy(true)}
    >
      <input type="hidden" name="return_to" value={returnTo} />
      <button className={className} type="submit" disabled={busy}>
        {busy ? 'Syncing QuickBooks…' : children}
      </button>
    </form>
  );
}
