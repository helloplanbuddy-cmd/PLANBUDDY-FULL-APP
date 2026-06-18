'use client';
// ============================================================
// /app/dashboard/layout.tsx — Single Auth Guard for all /dashboard/* routes
// P2 FIX: This layout is the SINGLE source of truth for auth.
//   Previously: layout + each page screen both called useAuthGuard (duplicate API calls).
//   Now: layout guards once; child screens receive isAuthorized=true implicitly.
//   Individual screens MUST NOT call useAuthGuard() — it lives exclusively here.
// Also: mounts useSessionRefresh for token auto-renewal.
// ============================================================

import { type ReactNode } from 'react';
import { useAuthGuardRaw } from '@/hooks/useAuthGuard';
import { useSessionRefresh } from '@/hooks/useAuth';

interface Props {
  children: ReactNode;
}

export default function DashboardLayout({ children }: Props) {
  // SINGLE auth check for all /dashboard/* routes
  // Handles: checking → spinner, unauthenticated → null (redirect via hook), authenticated → children
  const guardState = useAuthGuardRaw();

  // Auto-refresh access token every 12 min (access token TTL is 15 min)
  useSessionRefresh();

  if (guardState === 'checking') {
    return (
      <div style={{
        minHeight:      '100dvh',
        background:     '#070e1c',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width:        '32px',
          height:       '32px',
          border:       '3px solid rgba(99,102,241,0.2)',
          borderTop:    '3px solid #6366f1',
          borderRadius: '50%',
          animation:    'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (guardState === 'unauthenticated') {
    // Redirect handled by useAuthGuard — show nothing while redirect fires
    return null;
  }

  // guardState === 'authenticated': render children
  // Child screens (DashboardScreen, BuddyScreen, etc.) SHOULD NOT call useAuthGuard
  // for redirect purposes — they can call it for isAuthorized boolean if needed,
  // but they will always be authenticated here.
  return <>{children}</>;
}
