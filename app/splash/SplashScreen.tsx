'use client';
// ============================================================
// SplashScreen — Animated splash with fade-in / fade-out
// ============================================================

import { useEffect } from 'react';
import SplashLoader from '@/app/components/SplashLoader';
import { useSplash } from '@/hooks/useSplash';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import styles from './splash.module.css';

interface SplashScreenProps {
  duration?: number;
}

export default function SplashScreen({ duration = 2200 }: SplashScreenProps) {
  const { isFadingOut } = useSplash({ duration, fadeOutOffset: 400 });

  useEffect(() => {
    try {
      ClientAnalytics.track('app_opened');
      ClientAnalytics.track('splash_viewed');
    } catch {
      // analytics failures must not block navigation
    }
  }, []);

  return (
    <main
      className={`${styles.splash} ${isFadingOut ? styles.splashOut : styles.splashIn}`}
      aria-label="PlanBuddy loading"
      role="presentation"
      aria-hidden="true"
    >
      <div className={styles.logoWrap}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path
            d="M14 2.5L17 10H25L19 14.5L21.5 23L14 18.5L6.5 23L9 14.5L3 10H11L14 2.5Z"
            fill="white"
          />
        </svg>
      </div>

      <div className={styles.brandName}>PlanBuddy</div>
      <div className={styles.tagline}>AI Travel Planner</div>

      <SplashLoader duration={duration - 200} />
    </main>
  );
}
