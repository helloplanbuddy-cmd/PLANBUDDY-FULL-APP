'use client';
// ============================================================
// useOnboarding — Onboarding state & navigation
// Phase 2E Fix #1/#2: persist ALL onboarding fields with proper
//   TravelPreferences types — no type casting
// ============================================================

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ONBOARDING_SLIDES } from '@/app/onboarding/data';
import { STORAGE_KEYS } from '@/types/index';
import { useAppStore } from '@/store/appStore';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';

export function useOnboarding() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const updatePreferences = useAppStore((s) => s.updatePreferences);

  const totalSlides = ONBOARDING_SLIDES.length;
  const isLastSlide = currentSlide === totalSlides - 1;

  const completeOnboarding = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    } catch {
      // localStorage unavailable in some privacy modes
    }

    // Phase 2E Fix D: only mark onboarding complete — never overwrite user selections.
    // Previous versions reset all preference fields here, which would erase any
    // slide-level choices added in the future. Only the completion flag is written.
    updatePreferences({ onboardingCompleted: true });

    // Fix #5: track onboarding_completed
    ClientAnalytics.track('onboarding_completed');

    // Route change: Onboarding → Demo Trip Generator (not directly to login)
    router.push('/demo-trip-generator');
  }, [router, updatePreferences]);

  const skip = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const next = useCallback(() => {
    if (isTransitioning) return;
    if (isLastSlide) {
      completeOnboarding();
      return;
    }
    setIsTransitioning(true);
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
    setTimeout(() => setIsTransitioning(false), 340);
  }, [isTransitioning, isLastSlide, completeOnboarding, totalSlides]);

  const prev = useCallback(() => {
    if (isTransitioning || currentSlide === 0) return;
    setIsTransitioning(true);
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
    setTimeout(() => setIsTransitioning(false), 340);
  }, [isTransitioning, currentSlide]);

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning || index === currentSlide) return;
      if (index < 0 || index >= totalSlides) return;
      setIsTransitioning(true);
      setCurrentSlide(index);
      setTimeout(() => setIsTransitioning(false), 340);
    },
    [isTransitioning, currentSlide, totalSlides]
  );

  return {
    currentSlide,
    totalSlides,
    isLastSlide,
    isTransitioning,
    slide: ONBOARDING_SLIDES[currentSlide],
    next,
    prev,
    skip,
    goTo,
  };
}
