'use client';

import { useEffect } from 'react';
import SimpleBar from 'simplebar';
import 'simplebar/dist/simplebar.min.css';

export function MaxtonDashboardEffects() {
  useEffect(() => {
    const aside = document.querySelector<HTMLElement>('.sidebar-wrapper');
    if (!aside) return;

    const sb = new SimpleBar(aside);
    const onClose = () => document.body.classList.remove('toggled');
    const closeEl = document.querySelector('.sidebar-close');
    closeEl?.addEventListener('click', onClose);

    return () => {
      closeEl?.removeEventListener('click', onClose);
      sb.unMount();
    };
  }, []);

  return null;
}
