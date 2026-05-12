'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Ctx = {
  orderedJobIds: readonly string[];
  selected: ReadonlySet<string>;
  toggle: (jobId: string, orderIndex: number, e: React.ChangeEvent<HTMLInputElement>) => void;
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
      clear,
      copySelectedLinks,
      isSelected,
    }),
    [orderedJobIds, selected, toggle, clear, copySelectedLinks, isSelected],
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
      title="Select for bulk actions. Shift+click: range. Cmd/Ctrl+click: toggle without changing range anchor."
    />
  );
}

export function TicketBoardSelectionBar() {
  const ctx = useTicketBoardMultiSelectOptional();
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
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void ctx.copySelectedLinks()}>
        Copy ticket links
      </button>
      <span className="small text-body-secondary d-none d-md-inline">
        Tip: Shift+click a checkbox to select a range (board order). Cmd/Ctrl+click toggles one without changing the
        range anchor.
      </span>
    </div>
  );
}
