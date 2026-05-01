'use client';

import { useEffect } from 'react';

/** Backdrop below sidebar (z-index 12) on narrow viewports; tap or Escape closes the drawer. */
export function DashboardSidebarOverlay() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') document.body.classList.remove('toggled');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      type="button"
      className="dashboard-shell-overlay"
      aria-label="Close menu"
      onClick={() => document.body.classList.remove('toggled')}
    />
  );
}
