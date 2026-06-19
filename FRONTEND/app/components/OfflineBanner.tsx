'use client';
// ============================================================
// OfflineBanner — Shows when device is offline
// CHANGES (P1 fix):
//   - Now uses position:fixed so it overlays without causing layout shift
//   - Renders at top of screen, above all content
//   - SyncStatusBadge shown when online (unchanged)
//   - Added aria-atomic for better screen reader support
// ============================================================

import { useOffline } from '@/hooks/useOffline';
import { SyncStatusBadge } from './SyncStatusBadge';
import styles from './OfflineBanner.module.css';

export default function OfflineBanner() {
  const isOffline = useOffline();

  return (
    <>
      {isOffline && (
        <div
          className={styles.banner}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 1l12 12M10.7 4.3A6.5 6.5 0 0 1 13 7M1 7a6.5 6.5 0 0 1 2.3-2.7M4.5 9.5A3.5 3.5 0 0 1 7 8.5c.9 0 1.7.3 2.3.8M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
            />
          </svg>
          No internet — showing saved data
        </div>
      )}
      {/* SyncStatusBadge is position:fixed independently (see its CSS) */}
      {!isOffline && <SyncStatusBadge />}
    </>
  );
}
