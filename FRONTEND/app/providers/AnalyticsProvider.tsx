'use client';
// ============================================================
// app/providers/AnalyticsProvider.tsx — PostHog client setup
// Wraps the app and initializes PostHog for client-side events.
// ============================================================

import { useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '@/store/appStore';

interface Props {
  children: ReactNode;
  posthogKey?: string;
}

export function AnalyticsProvider({ children, posthogKey }: Props) {
  const auth    = useAppStore((s) => s.auth);
  const initRef = useRef(false);

  useEffect(() => {
    if (!posthogKey || initRef.current) return;
    initRef.current = true;

    // Lazy load PostHog to avoid blocking initial render
    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host:         'https://app.posthog.com',
        capture_pageview: true,
        capture_pageleave:true,
        persistence:      'localStorage',
        autocapture:      false, // Explicit event tracking only
        disable_session_recording: true,
      });

      if (auth?.userId) {
        posthog.identify(auth.userId, {
          phone_masked: auth.phone.slice(0, 4) + '****' + auth.phone.slice(-2),
        });
      }
    }).catch(() => {
      // Analytics must never break the app
    });
  }, [posthogKey, auth?.userId]);

  return <>{children}</>;
}

// ── Client-side tracking helpers ──────────────────────────

let _posthog: import('posthog-js').PostHog | null = null;

async function getPosthog() {
  if (_posthog) return _posthog;
  try {
    const { default: posthog } = await import('posthog-js');
    _posthog = posthog;
    return posthog;
  } catch {
    return null;
  }
}

export const ClientAnalytics = {
  async track(event: string, properties?: Record<string, unknown>) {
    try {
      const posthog = await getPosthog();
      posthog?.capture(event, properties);
    } catch {
      // noop
    }
  },

  // Pre-defined events
  tripCreated:    (destination: string, days: number) =>
    ClientAnalytics.track('trip_created', { destination, days }),
  tripCompleted:  (destination: string) =>
    ClientAnalytics.track('trip_completed', { destination }),
  expenseLogged:  (category: string, amount: number) =>
    ClientAnalytics.track('expense_logged', { category, amount }),
  memoryAdded:    () =>
    ClientAnalytics.track('memory_added'),
  screenViewed:   (screen: string) =>
    ClientAnalytics.track('screen_viewed', { screen }),
  offlineDetected:() =>
    ClientAnalytics.track('offline_detected'),
  syncSucceeded:  (count: number) =>
    ClientAnalytics.track('sync_succeeded', { items: count }),
};
