'use client';
// ============================================================
// useSplash — Custom hook for splash screen timer & navigation
// Routing logic:
//   1. No onboarding done → /onboarding
//   2. Onboarding done, demo not seen → /demo-trip-generator
//   3. Demo seen → /auth/phone  (middleware redirects to /dashboard if already authed)
// ============================================================
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '@/types/index';

interface UseSplashOptions {
  duration?: number;
  fadeOutOffset?: number;
}

interface StorageLike {
  getItem(key: string): string | null;
}

export function resolveSplashDestination(storage: StorageLike = window.localStorage): string {
  try {
    const onboardingDone = storage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true';
    const demoSeen = storage.getItem(STORAGE_KEYS.DEMO_SEEN) === 'true';

    if (!onboardingDone) return '/onboarding';
    if (!demoSeen) return '/demo-trip-generator';
    return '/auth/phone';
  } catch {
    return '/onboarding';
  }
}

export function useSplash({
  duration = 2200,
  fadeOutOffset = 400,
}: UseSplashOptions = {}) {
  const router = useRouter();
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>;
    let navTimer: ReturnType<typeof setTimeout>;

    const destination = resolveSplashDestination(window.localStorage);

    fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, Math.max(0, duration - fadeOutOffset));

    const NAV_BUFFER_MS = 120;

    navTimer = setTimeout(() => {
      setIsVisible(false);
      router.replace(destination);
    }, duration + NAV_BUFFER_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navTimer);
    };
  }, [duration, fadeOutOffset, router]);

  return { isFadingOut, isVisible };
}
