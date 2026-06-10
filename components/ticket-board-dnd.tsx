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
  type MutableRefObject,
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
  dragRef: MutableRefObject<DragPayload | null>;
  moveJob: (jobId: string, column: DashboardColumnKey) => Promise<void>;
};

const TicketBoardDndContext = createContext<BoardDndCtx | null>(null);

function useTicketBoardDnd(): BoardDndCtx {
  const ctx = useContext(TicketBoardDndContext);
  if (!ctx) throw new Error('TicketBoardDndContext missing');
  return ctx;
}

export function TicketBoardDndProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dragRef = useRef<DragPayload | null>(null);
  const [movingJobId, setMovingJobId] = useState<string | null>(null);

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
        dragRef.current = null;
      }
    },
    [router],
  );

  const ctxValue = useMemo(
    () => ({
      startDrag,
      movingJobId,
      dragRef,
      moveJob,
    }),
    [startDrag, movingJobId, moveJob],
  );

  return <TicketBoardDndContext.Provider value={ctxValue}>{children}</TicketBoardDndContext.Provider>;
}

/** Drop target for one board column. Pass ticket cards as server-component children. */
export function TicketBoardColumnBody({
  column,
  children,
}: {
  column: DashboardColumnKey;
  children: ReactNode;
}) {
  const { dragRef, moveJob } = useTicketBoardDnd();
  const [dropActive, setDropActive] = useState(false);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropActive(true);
    },
    [dragRef],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropActive(false);
      const payload = dragRef.current;
      if (!payload) return;
      if (payload.fromColumn === column) {
        dragRef.current = null;
        return;
      }
      void moveJob(payload.jobId, column);
    },
    [column, dragRef, moveJob],
  );

  return (
    <div
      className={dropActive ? 'board-list-body is-drop-target' : 'board-list-body'}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
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
