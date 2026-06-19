'use client';
// ============================================================
// hooks/useMonitoring.ts — Performance & analytics monitoring hook
// Phase 8+10: Tracks:
//   - Route changes (screen_viewed)
//   - API error rates
//   - Core Web Vitals (CLS, LCP, FCP via PerformanceObserver)
//   - Offline/online transitions
// ============================================================

import { useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';

export function useMonitoring() {
  const pathname = usePathname();

  // Track route changes as screen_viewed events
  useEffect(() => {
    if (!pathname) return;
    // Map pathname to screen name
    const screen = pathname.replace('/dashboard/', '').replace('/auth/', '') || 'home';
    ClientAnalytics.screenViewed(screen);
  }, [pathname]);

  // Track online/offline transitions
  useEffect(() => {
    function handleOnline()  { ClientAnalytics.track('app_online');  }
    function handleOffline() { ClientAnalytics.track('app_offline'); }

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track Core Web Vitals
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            ClientAnalytics.track('web_vital_lcp', { value: Math.round(entry.startTime) });
          }
          if (entry.entryType === 'layout-shift' && !(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) {
            ClientAnalytics.track('web_vital_cls', { value: (entry as PerformanceEntry & { value: number }).value });
          }
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      observer.observe({ type: 'layout-shift',             buffered: true });
      return () => observer.disconnect();
    } catch {
      // PerformanceObserver not available in all environments
    }
  }, []);

  const trackApiError = useCallback((endpoint: string, status: number, message: string) => {
    ClientAnalytics.track('api_error', { endpoint, status, message });
  }, []);

  return { trackApiError };
}
