// ============================================================
// useOffline — PHASE 1 UPGRADE
// Was: simple navigator.onLine listener
// Now: online/offline detection + IndexedDB hydration on mount
//      + background sync flush when reconnected
// ============================================================

'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { hydrateOfflineDB } from '@/lib/offlineDB';
import { syncEngine } from '@/lib/syncEngine';

export function useOffline() {
  const setOffline = useAppStore((s) => s.setOffline);
  const isOffline  = useAppStore((s) => s.isOffline);
  const hydrated   = useRef(false);

  // ── Hydrate IndexedDB once on first auth ───────────────
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const state = useAppStore.getState();
    if (state.isAuthenticated) {
      hydrateOfflineDB({
        trips:    state.trips,
        expenses: state.expenses,
        memories: state.memories,
      }).catch(() => { /* non-fatal */ });
    }
  }, []);

  // ── Network event listeners ────────────────────────────
  useEffect(() => {
    const onOnline  = () => { setOffline(false); flushSyncQueue(); };
    const onOffline = () => setOffline(true);

    setOffline(!navigator.onLine);

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOffline]);

  return isOffline;
}

// ── Background sync flush ──────────────────────────────────
// Delegates to the existing syncEngine, which drains the offline
// operation queue (trips/expenses/memories/contacts), handles
// retries with backoff, and resolves server/client conflicts.

async function flushSyncQueue() {
  try {
    await syncEngine.flush();
  } catch (err) {
    console.warn('[useOffline] Sync flush failed:', err);
  }
}
