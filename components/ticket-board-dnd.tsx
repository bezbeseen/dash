'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { DashboardColumnKey } from '@/lib/domain/board-display';

type DragPayload = {
  jobId: string;
  fromColumn: DashboardColumnKey;
};

type BoardDndCtx = {
  startDrag: (e: DragEvent<HTMLElement>, jobId: string, fromColumn: DashboardColumnKey) => void;
  movingJobId: string | null;
};

const TicketBoardDndContext = createContext<BoardDndCtx | null>(null);

function useTicketBoardDnd(): BoardDndCtx {
  const ctx = useContext(TicketBoardDndContext);
  if (!ctx) throw new Error('TicketBoardDndContext missing');
  return ctx;
}

export type TicketBoardColumnHandlers = {
  onColumnDragOver: (e: DragEvent<HTMLElement>, column: DashboardColumnKey) => void;
  onColumnDragLeave: (e: DragEvent<HTMLElement>) => void;
  onColumnDrop: (e: DragEvent<HTMLElement>, column: DashboardColumnKey) => void;
  dropColumn: DashboardColumnKey | null;
  movingJobId: string | null;
};

export function TicketBoardDndProvider({
  children,
}: {
  children: (handlers: TicketBoardColumnHandlers) => ReactNode;
}) {
  const router = useRouter();
  const dragRef = useRef<DragPayload | null>(null);
  const [movingJobId, setMovingJobId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<DashboardColumnKey | null>(null);

  const startDrag = useCallback((e: DragEvent<HTMLElement>, jobId: string, fromColumn: DashboardColumnKey) => {
    dragRef.current = { jobId, fromColumn };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', jobId);
    const card = e.currentTarget.closest('.card');
    if (card instanceof HTMLElement) {
      e.dataTransfer.setDragImage(card, 20, 20);
    }
  }, []);

  const moveJob = useCallback(
    async (jobId: string, column: DashboardColumnKey) => {
      setMovingJobId(jobId);
      try {
        const res = await fetch(`/api/jobs/${jobId}/move-board`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ column }),
        });
        if (!res.ok) return;
        router.refresh();
      } finally {
        setMovingJobId(null);
        setDropColumn(null);
        dragRef.current = null;
      }
    },
    [router],
  );

  const onColumnDragOver = useCallback((e: DragEvent<HTMLElement>, column: DashboardColumnKey) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropColumn(column);
  }, []);

  const onColumnDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropColumn(null);
  }, []);

  const onColumnDrop = useCallback(
    (e: DragEvent<HTMLElement>, column: DashboardColumnKey) => {
      e.preventDefault();
      const payload = dragRef.current;
      if (!payload) return;
      if (payload.fromColumn === column) {
        setDropColumn(null);
        dragRef.current = null;
        return;
      }
      void moveJob(payload.jobId, column);
    },
    [moveJob],
  );

  const ctxValue = useMemo(() => ({ startDrag, movingJobId }), [startDrag, movingJobId]);

  return (
    <TicketBoardDndContext.Provider value={ctxValue}>
      {children({ onColumnDragOver, onColumnDragLeave, onColumnDrop, dropColumn, movingJobId })}
    </TicketBoardDndContext.Provider>
  );
}

export function JobCardDragHandle({
  jobId,
  column,
}: {
  jobId: string;
  column: DashboardColumnKey;
}) {
  const { startDrag, movingJobId } = useTicketBoardDnd();
  const busy = movingJobId === jobId;

  return (
    <button
      type="button"
      className={`job-card-drag-handle${busy ? ' is-busy' : ''}`}
      draggable={!busy}
      aria-label="Drag to move ticket to another column"
      title="Drag to another column"
      onDragStart={(e) => {
        startDrag(e, jobId, column);
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <i className="material-icons-outlined" aria-hidden>
        drag_indicator
      </i>
    </button>
  );
}

export function boardListBodyClass(column: DashboardColumnKey, dropColumn: DashboardColumnKey | null): string {
  return dropColumn === column ? 'board-list-body is-drop-target' : 'board-list-body';
}
