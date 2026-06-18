// ============================================================
// useVirtualKeyboard — Prevent input overlap on mobile
// Listens to visualViewport resize and scrolls active input into view
// ============================================================

'use client';

import { useEffect } from 'react';

export function useVirtualKeyboard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl) return;
      const tag = activeEl.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') return;

      // Small delay to let the layout settle
      requestAnimationFrame(() => {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };

    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);
}
