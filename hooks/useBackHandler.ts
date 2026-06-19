// ============================================================
// useBackHandler — Android back button + browser back support
// ============================================================

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface BackHandlerOptions {
  /** Called when back is pressed. Return true to prevent default navigation. */
  onBack?: () => boolean | void;
  /** If true, push a history entry on mount so back doesn't close the app */
  pushState?: boolean;
}

export function useBackHandler({ onBack, pushState = true }: BackHandlerOptions = {}) {
  const router = useRouter();

  const handlePopState = useCallback(() => {
    if (onBack) {
      const handled = onBack();
      if (handled) {
        // Re-push so the back button still works next press
        window.history.pushState(null, '', window.location.href);
        return;
      }
    }
    router.back();
  }, [onBack, router]);

  useEffect(() => {
    if (pushState) {
      window.history.pushState(null, '', window.location.href);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handlePopState, pushState]);
}
