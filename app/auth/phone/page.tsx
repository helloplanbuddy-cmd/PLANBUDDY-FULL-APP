// ============================================================
// /app/auth/phone/page.tsx — Phone Login Route
// ============================================================
import { Metadata } from 'next';
import PhoneScreen from './PhoneScreen';

export const metadata: Metadata = {
  title: 'Sign In — PlanBuddy',
  description: 'Enter your phone number to sign in to PlanBuddy with OTP.',
  robots: { index: false, follow: false },
};

export default function PhonePage() {
  return <PhoneScreen />;
}
