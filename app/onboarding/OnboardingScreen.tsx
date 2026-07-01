'use client';
// ============================================================
// OnboardingScreen — Multi-slide onboarding flow
// Pixel-perfect match to PlanBuddy v2.0 design
// ============================================================

import { useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingCard from '@/app/components/OnboardingCard';
import PaginationDots from '@/app/components/PaginationDots';
import PrimaryButton from '@/app/components/PrimaryButton';
import { useOnboarding } from '@/hooks/useOnboarding';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { STORAGE_KEYS } from '@/types/index';
import styles from './onboarding.module.css';

export default function OnboardingScreen() {
  const router = useRouter();
  const { currentSlide, totalSlides, isLastSlide, slide, next, skip } = useOnboarding();

  const goToLogin = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
      localStorage.setItem(STORAGE_KEYS.DEMO_SEEN, 'true');
    } catch {
      // ignore storage failures and continue with navigation
    }

    try {
      ClientAnalytics.track('onboarding_completed', { via: 'login_shortcut' });
    } catch {
      // analytics failures must not block navigation
    }

    router.replace('/auth/phone');
  }, [router]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevSlideRef = useRef(currentSlide);

  useEffect(() => {
    try {
      ClientAnalytics.track('onboarding_started');
    } catch {
      // analytics failures must not break onboarding
    }
  }, []);

  useEffect(() => {
    if (prevSlideRef.current !== currentSlide) {
      prevSlideRef.current = currentSlide;
      const t = setTimeout(() => headingRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [currentSlide]);

  return (
    <main
      className={styles.screen}
      role="main"
      aria-label="Welcome to PlanBuddy"
    >
      <button
        className={styles.skipBtn}
        onClick={skip}
        aria-label="Skip onboarding and go to demo trip generator"
      >
        Skip
      </button>

      <div
        className={styles.visual}
        aria-hidden="true"
        key={`visual-${currentSlide}`}
      >
        <OnboardingCard pills={slide.pills} />
      </div>

      <div className={styles.bottom}>
        <PaginationDots
          total={totalSlides}
          current={currentSlide}
          className={styles.dots}
        />

        <div className={styles.hook} key={`hook-${currentSlide}`}>
          <h1
            ref={headingRef}
            className={styles.heading}
            tabIndex={-1}
            dangerouslySetInnerHTML={{ __html: slide.heading }}
          />
          <p className={styles.description}>{slide.description}</p>
        </div>

        <PrimaryButton
          onClick={next}
          aria-label={isLastSlide ? 'Try it free — generate a sample trip' : 'Next slide'}
        >
          {isLastSlide ? 'Try It Free — See a Sample Trip' : 'Next →'}
        </PrimaryButton>

        {isLastSlide && (
          <PrimaryButton
            variant="ghost"
            onClick={goToLogin}
            aria-label="Already have an account — log in"
            style={{ marginTop: '8px' }}
          >
            Already have an account? Log in
          </PrimaryButton>
        )}
      </div>
    </main>
  );
}
