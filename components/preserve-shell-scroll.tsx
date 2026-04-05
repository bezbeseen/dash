'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'dash.scrollRestore.v1';
const MAX_AGE_MS = 120_000;

/** Pathnames where we capture scroll before POST and restore after redirect back here. */
const BOARD_PATHS = new Set(['/dashboard/tickets', '/dashboard/done']);

/**
 * Strict Mode runs effects twice; we cancel a deferred `sessionStorage` clear on unmount so the
 * second pass can read the same payload and re-apply if the remount reset scroll, then clear.
 */
let lastAppliedScrollPayloadT: number | null = null;

type Payload = {
  path: string;
  wx: number;
  wy: number;
  canvasLeft: number;
  archiveTop: number;
  t: number;
};

function parsePayload(raw: string | null): Payload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Payload;
    if (
      !p ||
      typeof p.path !== 'string' ||
      typeof p.wx !== 'number' ||
      typeof p.wy !== 'number' ||
      typeof p.canvasLeft !== 'number' ||
      typeof p.archiveTop !== 'number' ||
      typeof p.t !== 'number'
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function captureScroll(path: string) {
  const canvas = document.querySelector('.board-canvas');
  const archive = document.querySelector('[data-archive-scroll]');
  const payload: Payload = {
    path,
    wx: window.scrollX,
    wy: window.scrollY,
    canvasLeft: canvas instanceof HTMLElement ? canvas.scrollLeft : 0,
    archiveTop: archive instanceof HTMLElement ? archive.scrollTop : 0,
    t: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function applyScroll(p: Payload) {
  window.scrollTo(p.wx, p.wy);
  const canvas = document.querySelector('.board-canvas');
  if (canvas instanceof HTMLElement) {
    canvas.scrollLeft = p.canvasLeft;
  }
  const archive = document.querySelector('[data-archive-scroll]');
  if (archive instanceof HTMLElement) {
    archive.scrollTop = p.archiveTop;
  }
}

/**
 * After a POST from the production board or Done archive (e.g. Start / Done / Sync),
 * full-page redirect resets scroll. We stash window + .board-canvas + [data-archive-scroll]
 * positions in sessionStorage and re-apply on return.
 */
export function PreserveShellScroll() {
  const pathname = usePathname() ?? '';

  useLayoutEffect(() => {
    if (!BOARD_PATHS.has(pathname)) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    const payload = parsePayload(raw);
    if (!payload) return;
    if (Date.now() - payload.t > MAX_AGE_MS) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (payload.path !== pathname) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    if (lastAppliedScrollPayloadT === payload.t) {
      applyScroll(payload);
      requestAnimationFrame(() => {
        applyScroll(payload);
        requestAnimationFrame(() => applyScroll(payload));
      });
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    lastAppliedScrollPayloadT = payload.t;
    applyScroll(payload);
    requestAnimationFrame(() => {
      applyScroll(payload);
      requestAnimationFrame(() => applyScroll(payload));
    });

    const clearTid = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }, 0);

    return () => window.clearTimeout(clearTid);
  }, [pathname]);

  useEffect(() => {
    const onSubmitCapture = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() !== 'post') return;
      if (form.hasAttribute('data-no-scroll-restore')) return;
      if (!BOARD_PATHS.has(pathname)) return;

      const action = form.getAttribute('action') || '';
      if (!action.includes('/api/jobs/')) return;

      captureScroll(pathname);
    };

    document.addEventListener('submit', onSubmitCapture, true);
    return () => document.removeEventListener('submit', onSubmitCapture, true);
  }, [pathname]);

  return null;
}
