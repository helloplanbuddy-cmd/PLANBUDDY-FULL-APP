'use client';
// ============================================================
// hooks/useSyncStatus.ts — React hook for sync engine status
// ============================================================

import { useState, useEffect } from 'react';
import { syncEngine, setSyncAuthProvider, type SyncStatus } from '@/lib/syncEngine';
import { useAppStore } from '@/store/appStore';

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    state:         'idle',
    pendingCount:  0,
    lastSync:      null,
    lastError:     null,
    conflictCount: 0,
  });
  const auth = useAppStore((s) => s.auth);

  useEffect(() => {
    // Inject auth token provider into sync engine
    setSyncAuthProvider(() => auth?.token ?? null);
  }, [auth?.token]);

  useEffect(() => {
    const unsub = syncEngine.subscribe(setStatus);
    syncEngine.startBackgroundSync();
    return () => { unsub(); };
  }, []);

  return status;
}
