'use client';
// ============================================================
// app/components/SyncStatusBadge.tsx
// Shows pending sync count; visible when items are queued
// or when sync has errored.
// ============================================================

import { useSyncStatus } from '@/hooks/useSyncStatus';
import styles from './SyncStatusBadge.module.css';

export function SyncStatusBadge() {
  const { state, pendingCount, lastError } = useSyncStatus();

  if (state === 'idle' && pendingCount === 0) return null;

  const label =
    state === 'syncing'
      ? 'Syncing…'
      : state === 'error'
      ? `${pendingCount} pending`
      : `${pendingCount} queued`;

  const isError = state === 'error' || !!lastError;

  return (
    <div className={`${styles.badge} ${isError ? styles.error : styles.syncing}`}>
      <span className={styles.dot} />
      {label}
    </div>
  );
}
