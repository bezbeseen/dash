'use client';

import { useCallback, useState } from 'react';
import { useTicketBoardMultiSelectOptional } from '@/components/ticket-board-multi-select';

const BATCH_SIZE = 100;

async function batchArchiveChunk(
  jobIds: string[],
  reason: 'DISMISSED' | 'LOST',
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const res = await fetch('/api/jobs/batch-archive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ jobIds, reason }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) {
    throw new Error('batch_failed');
  }
  const succeeded =
    'succeeded' in data && Array.isArray(data.succeeded) ? (data.succeeded as string[]) : [];
  const failed =
    'failed' in data && Array.isArray(data.failed)
      ? (data.failed as { id: string; error: string }[])
      : [];
  return { succeeded, failed };
}

async function batchArchiveAll(jobIds: string[], reason: 'DISMISSED' | 'LOST') {
  const allSucceeded: string[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (let i = 0; i < jobIds.length; i += BATCH_SIZE) {
    const chunk = jobIds.slice(i, i + BATCH_SIZE);
    const { succeeded, failed } = await batchArchiveChunk(chunk, reason);
    allSucceeded.push(...succeeded);
    allFailed.push(...failed);
  }

  return { succeeded: allSucceeded, failed: allFailed };
}

function summarizeBatchResult(succeeded: number, failed: { id: string; error: string }[]) {
  if (failed.length > 0 && succeeded > 0) {
    window.alert(`Updated ${succeeded}. Skipped ${failed.length} (already off the board or not found).`);
  } else if (failed.length > 0 && succeeded === 0) {
    return `None updated — ${failed.length} skipped.`;
  }
  return null;
}

export function PrequoteColumnSelectAll({ jobIds }: { jobIds: string[] }) {
  const ctx = useTicketBoardMultiSelectOptional();
  if (!ctx || jobIds.length === 0) return null;

  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 prequote-column-select-all"
      onClick={() => ctx.selectMany(jobIds)}
    >
      Select all ({jobIds.length})
    </button>
  );
}

export function PrequoteSelectionBar() {
  const ctx = useTicketBoardMultiSelectOptional();
  const [busy, setBusy] = useState<'dismiss' | 'lost' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBatch = useCallback(
    async (reason: 'DISMISSED' | 'LOST') => {
      if (!ctx || ctx.selected.size === 0) return;
      const n = ctx.selected.size;
      const verb = reason === 'DISMISSED' ? 'Dismiss' : 'Mark lost';
      const detail =
        reason === 'DISMISSED'
          ? 'junk / low-intent leads (not a real lost deal)'
          : 'real leads that will not convert';

      if (!window.confirm(`${verb} ${n} pre-quote ticket${n === 1 ? '' : 's'}?\n\n${detail}`)) {
        return;
      }

      setBusy(reason === 'DISMISSED' ? 'dismiss' : 'lost');
      setError(null);
      const jobIds = [...ctx.selected];

      try {
        const { succeeded, failed } = await batchArchiveAll(jobIds, reason);
        const errMsg = summarizeBatchResult(succeeded.length, failed);
        if (errMsg) setError(errMsg);
        if (succeeded.length > 0) {
          ctx.clear();
          window.location.reload();
        }
      } catch {
        setError('Could not update tickets. Check your connection and try again.');
      } finally {
        setBusy(null);
      }
    },
    [ctx],
  );

  if (!ctx || ctx.selected.size === 0) return null;

  return (
    <div
      className="ticket-board-select-bar d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-body-secondary border-secondary-subtle"
      role="region"
      aria-label="Pre-quote selection"
    >
      <span className="small fw-semibold text-body-secondary">{ctx.selected.size} selected</span>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={ctx.clear}>
        Clear
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        disabled={busy != null}
        onClick={() => void runBatch('DISMISSED')}
      >
        {busy === 'dismiss' ? 'Working…' : 'Dismiss (junk)'}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-lost"
        disabled={busy != null}
        onClick={() => void runBatch('LOST')}
      >
        {busy === 'lost' ? 'Working…' : 'Mark lost'}
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void ctx.copySelectedLinks()}>
        Copy links
      </button>
      {error ? (
        <span className="small text-danger" role="alert">
          {error}
        </span>
      ) : null}
      <span className="small text-body-secondary d-none d-lg-inline">
        Tip: use <strong>Select all</strong> in a column header, or Shift+click checkboxes for a range.
      </span>
    </div>
  );
}
