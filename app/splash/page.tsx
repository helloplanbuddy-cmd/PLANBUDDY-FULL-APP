// ============================================================
// /app/splash/page.tsx — Splash Screen Route
// ============================================================
import { Metadata } from 'next';
import SplashScreen from './SplashScreen';

export const metadata: Metadata = {
  title: 'PlanBuddy — Loading',
  description: 'PlanBuddy AI Travel Companion is loading.',
  robots: { index: false, follow: false },
};

export default function SplashPage() {
  return <SplashScreen duration={2200} />;
}
