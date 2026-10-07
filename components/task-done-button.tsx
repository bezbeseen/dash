'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function TaskDoneButton({ taskId, className }: { taskId: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function markDone() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/tasks/${taskId}/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status: 'DONE' }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="btn btn-sm btn-outline-success"
        title="Mark done"
        disabled={busy}
        onClick={() => void markDone()}
      >
        {busy ? 'Saving…' : 'Done'}
      </button>
      {failed ? <div className="small text-danger mt-1">Could not save.</div> : null}
    </div>
  );
}
