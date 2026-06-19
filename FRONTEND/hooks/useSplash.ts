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

export function useSplash({
  duration = 2200,
  fadeOutOffset = 400,
}: UseSplashOptions = {}) {
  const router = useRouter();
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>;
    let navTimer:  ReturnType<typeof setTimeout>;

    const destination = (() => {
      try {
        const onboardingDone = localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true';
        const demoSeen       = localStorage.getItem(STORAGE_KEYS.DEMO_SEEN)       === 'true';

        if (!onboardingDone) return '/onboarding';          // First ever launch
        if (!demoSeen)       return '/demo-trip-generator'; // Saw onboarding, not demo yet
        return '/auth/phone';                               // Saw demo → go to login
        // Note: middleware redirects /auth/* → /dashboard if access token cookie exists
      } catch {
        return '/onboarding';
      }
    })();

    fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, duration - fadeOutOffset);

    navTimer = setTimeout(() => {
      setIsVisible(false);
      // Use replace() so splash is removed from history stack.
      // Browser back from Onboarding/Demo should not return to splash.
      router.replace(destination);
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navTimer);
    };
  }, [duration, fadeOutOffset, router]);

  return { isFadingOut, isVisible };
}
