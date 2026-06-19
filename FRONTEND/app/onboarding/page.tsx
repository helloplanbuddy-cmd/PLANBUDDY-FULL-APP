// ============================================================
// /app/onboarding/page.tsx — Onboarding Route
// ============================================================
import { Metadata } from 'next';
import OnboardingScreen from './OnboardingScreen';

export const metadata: Metadata = {
  title: 'Welcome to PlanBuddy',
  description:
    'Plan any India trip in seconds with AI. Smart budgets, route maps, and a travel companion — all in one app.',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
