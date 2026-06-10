'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Ctx = {
  orderedJobIds: readonly string[];
  selected: ReadonlySet<string>;
  toggle: (jobId: string, orderIndex: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  selectMany: (jobIds: readonly string[]) => void;
  clear: () => void;
  copySelectedLinks: () => Promise<void>;
  isSelected: (jobId: string) => boolean;
};

const TicketBoardMultiSelectContext = createContext<Ctx | null>(null);

export function useTicketBoardMultiSelectOptional(): Ctx | null {
  return useContext(TicketBoardMultiSelectContext);
}

export function TicketBoardMultiSelectProvider({
  orderedJobIds,
  children,
}: {
  orderedJobIds: readonly string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastAnchorRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    lastAnchorRef.current = null;
    setSelected(new Set());
  }, []);

  const selectMany = useCallback((jobIds: readonly string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of jobIds) next.add(id);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (jobId: string, orderIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const ne = e.nativeEvent;
      const mod = ne instanceof MouseEvent && (ne.metaKey || ne.ctrlKey);
      const shift = ne instanceof MouseEvent && ne.shiftKey;

      if (mod) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(jobId)) next.delete(jobId);
          else next.add(jobId);
          return next;
        });
        return;
      }

      if (shift && lastAnchorRef.current !== null) {
        const a = Math.min(lastAnchorRef.current, orderIndex);
        const b = Math.max(lastAnchorRef.current, orderIndex);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = a; i <= b; i++) {
            const id = orderedJobIds[i];
            if (id) next.add(id);
          }
          return next;
        });
        lastAnchorRef.current = orderIndex;
        return;
      }

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
        return next;
      });
      lastAnchorRef.current = orderIndex;
    },
    [orderedJobIds],
  );

  const copySelectedLinks = useCallback(async () => {
    if (selected.size === 0) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const lines = [...selected].map((id) => `${origin}/dashboard/jobs/${id}`);
    await navigator.clipboard.writeText(lines.join('\n'));
  }, [selected]);

  const isSelected = useCallback((jobId: string) => selected.has(jobId), [selected]);

  const value = useMemo(
    () => ({
      orderedJobIds,
      selected,
      toggle,
      selectMany,
      clear,
      copySelectedLinks,
      isSelected,
    }),
    [orderedJobIds, selected, toggle, selectMany, clear, copySelectedLinks, isSelected],
  );

  return (
    <TicketBoardMultiSelectContext.Provider value={value}>{children}</TicketBoardMultiSelectContext.Provider>
  );
}

export function TicketBoardCheckbox({ jobId, orderIndex }: { jobId: string; orderIndex: number }) {
  const ctx = useTicketBoardMultiSelectOptional();
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="form-check-input mt-1 flex-shrink-0 job-board-ticket-checkbox"
      checked={ctx.isSelected(jobId)}
      onChange={(e) => ctx.toggle(jobId, orderIndex, e)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Select ticket"
      title="Select for bulk actions (Mark done, copy links). Shift+click: range. Cmd/Ctrl+click: toggle without changing range anchor."
    />
  );
}

function failureMessage(code: string): string {
  switch (code) {
    case 'not_found':
      return 'not found';
    case 'already_archived':
      return 'already off the board';
    default:
      return code === 'This job is already off the board.' ? 'already off the board' : code;
  }
}

export function TicketBoardSelectionBar() {
  const ctx = useTicketBoardMultiSelectOptional();
  const [doneBusy, setDoneBusy] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);

  const markSelectedDone = useCallback(async () => {
    if (!ctx || ctx.selected.size === 0) return;
    const n = ctx.selected.size;
    if (
      !window.confirm(
        `Mark ${n} ticket${n === 1 ? '' : 's'} as done? They will be removed from the board (same as Done on each card).`,
      )
    ) {
      return;
    }

    setDoneBusy(true);
    setDoneError(null);
    const jobIds = [...ctx.selected];

    try {
      const res = await fetch('/api/jobs/batch-done', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ jobIds }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) {
        setDoneError('Could not mark tickets done. Try again or use Done on each ticket.');
        setDoneBusy(false);
        return;
      }

      const failed = 'failed' in data && Array.isArray(data.failed) ? data.failed : [];
      const succeeded =
        'succeeded' in data && Array.isArray(data.succeeded) ? (data.succeeded as string[]).length : 0;

      const failedRows = failed as { id: string; error: string }[];
      const skipSummary = failedRows
        .slice(0, 8)
        .map((f) => failureMessage(f.error))
        .join('\n• ');
      const skipExtra = failedRows.length > 8 ? `\n… and ${failedRows.length - 8} more` : '';

      if (failedRows.length > 0 && succeeded > 0) {
        window.alert(
          `Marked ${succeeded} ticket${succeeded === 1 ? '' : 's'} done.\n\nSkipped (${failedRows.length}):\n• ${skipSummary}${skipExtra}`,
        );
      } else if (failedRows.length > 0) {
        const parts = failedRows.slice(0, 5).map((f) => failureMessage(f.error));
        const extra = failedRows.length > 5 ? ` (+${failedRows.length - 5} more)` : '';
        setDoneError(`None marked done: ${parts.join('; ')}${extra}`);
      }

      if (succeeded > 0) {
        ctx.clear();
        // Full reload: this page is mostly RSC; router.refresh() often left the board stale after batch archive.
        window.location.reload();
      }
    } catch {
      setDoneError('Network error. Check your connection and try again.');
    } finally {
      setDoneBusy(false);
    }
  }, [ctx]);

  if (!ctx || ctx.selected.size === 0) return null;

  return (
    <div
      className="ticket-board-select-bar d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-body-secondary border-secondary-subtle"
      role="region"
      aria-label="Ticket selection"
    >
      <span className="small fw-semibold text-body-secondary">{ctx.selected.size} selected</span>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={ctx.clear}>
        Clear
      </button>
      <button
        type="button"
        className="btn btn-sm btn-success"
        disabled={doneBusy}
        onClick={() => void markSelectedDone()}
      >
        {doneBusy ? 'Working…' : 'Mark done'}
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void ctx.copySelectedLinks()}>
        Copy ticket links
      </button>
      {doneError ? (
        <span className="small text-danger" role="alert">
          {doneError}
        </span>
      ) : null}
      <span className="small text-body-secondary d-none d-md-inline">
        Tip: Shift+click a checkbox to select a range (board order). Cmd/Ctrl+click toggles one without changing the
        range anchor.
      </span>
    </div>
  );
}
