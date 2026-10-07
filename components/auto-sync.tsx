'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const INTERVAL_MS = 5 * 60_000;

function isEditing(): boolean {
  const el = document.activeElement;
  return (
    (el instanceof HTMLElement &&
      (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) ||
    document.querySelector('[data-autosync-hold]') != null
  );
}

/**
 * Keeps tickets current while Dash is open: every few minutes (and when the tab comes back into
 * view) the server pulls QuickBooks changes and new Yelp lead emails. When something changed the
 * page refreshes, but never mid-drag, while someone is typing, or while an element marked
 * `data-autosync-hold` (e.g. a half-typed task) is on the page. The server skips the run when
 * another tab synced moments ago.
 */
export function AutoSync() {
  const router = useRouter();

  useEffect(() => {
    let running = false;
    let refreshPending = false;
    let dragging = false;

    const flush = () => {
      if (!refreshPending || document.hidden || dragging || isEditing()) return;
      refreshPending = false;
      router.refresh();
    };

    const run = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const res = await fetch('/api/jobs/auto-sync', { method: 'POST', credentials: 'include' });
        if (res.ok && ((await res.json()) as { changed?: boolean }).changed) {
          refreshPending = true;
          flush();
        }
      } catch {
        /* offline or mid-deploy; the next tick retries */
      } finally {
        running = false;
      }
    };

    const onTick = () => {
      flush();
      void run();
    };
    const onVisibility = () => {
      if (!document.hidden) onTick();
    };
    const onDragStart = () => {
      dragging = true;
    };
    const onDragEnd = () => {
      dragging = false;
      window.setTimeout(flush, 1000);
    };
    const onFocusOut = () => window.setTimeout(flush, 0);

    void run();
    const timer = window.setInterval(onTick, INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [router]);

  return null;
}
