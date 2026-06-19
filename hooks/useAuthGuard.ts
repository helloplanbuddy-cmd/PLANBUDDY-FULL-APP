'use client';
// ============================================================
// hooks/useAuthGuard.ts — Client-side auth guard
// Phase 2D: Returns {isAuthorized, isChecking} object
//           Exports useLogout hook
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { AuthService } from '@/src/services/auth.service';
import { ApiError } from '@/lib/apiClient';

// ─── useAuthGuard ─────────────────────────────────────────

interface AuthGuardResult {
  isAuthorized: boolean;
  isChecking: boolean;
}

// Internal string state — kept for dashboard/layout.tsx which reads raw strings
type GuardState = 'checking' | 'authenticated' | 'unauthenticated';

export function useAuthGuard(): AuthGuardResult {
  const router = useRouter();
  const auth          = useAppStore((s) => s.auth);
  const clearAuth     = useAppStore((s) => s.clearAuth);
  const clearUserData = useAppStore((s) => s.clearUserData);
  const [state, setState] = useState<GuardState>('checking');

  useEffect(() => {
    async function check() {
      if (!auth?.token) {
        // No local auth — try server session
        try {
          await AuthService.getSession();
          setState('authenticated');
          return;
        } catch {
          // offline or server error — fall through
        }
        clearUserData();
        clearAuth();
        setState('unauthenticated');
        router.replace('/auth/phone');
        return;
      }

      // We have a local token — verify it
      try {
        await AuthService.getSession(auth.token);
        setState('authenticated');
        return;
      } catch (err) {
        // Access token expired/invalid — try silent refresh via POST /session
        if (err instanceof ApiError && err.status !== 0) {
          try {
            await AuthService.refreshSession();
            setState('authenticated');
            return;
          } catch (refreshErr) {
            if (refreshErr instanceof ApiError && refreshErr.status === 0 && auth?.token) {
              // Network error on refresh — allow offline access if we have local token
              setState('authenticated');
              return;
            }
          }
        } else if (auth?.token) {
          // Network error verifying token — allow offline access
          setState('authenticated');
          return;
        }
      }

      clearUserData();
      clearAuth();
      setState('unauthenticated');
      router.replace('/auth/phone');
    }

    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isAuthorized: state === 'authenticated',
    isChecking:   state === 'checking',
  };
}

// ─── useAuthGuardRaw ──────────────────────────────────────
// Used by dashboard/layout.tsx which checks raw string states
export function useAuthGuardRaw(): GuardState {
  const { isAuthorized, isChecking } = useAuthGuard();
  if (isChecking)   return 'checking';
  if (isAuthorized) return 'authenticated';
  return 'unauthenticated';
}

// ─── useLogout ────────────────────────────────────────────

export function useLogout() {
  const router    = useRouter();
  const clearAuth = useAppStore((s) => s.clearAuth);
  const clearUserData = useAppStore((s) => s.clearUserData);

  return useCallback(async () => {
    try {
      await AuthService.logout();
    } catch {
      // ignore — we clear locally regardless
    }
    clearUserData(); // Fix #5: clear all user-owned state
    clearAuth();
    router.replace('/auth/phone');
  }, [clearAuth, clearUserData, router]);
}
