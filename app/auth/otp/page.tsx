// ============================================================
// /app/auth/otp/page.tsx — OTP Verification Route
// ============================================================
import type { Metadata } from 'next';
import { Suspense } from 'react';
import OTPScreen from './OTPScreen';

export const metadata: Metadata = {
  title: 'Verify OTP — PlanBuddy',
  description: 'Enter the 6-digit OTP sent to your phone.',
  robots: { index: false, follow: false },
};

function OTPFallback() {
  return (
    <div
      style={{
        /* FIX: position:fixed + inset:0 covered the entire viewport on desktop,
           creating a large black region outside the 480px #app column.
           position:absolute fills #app (the containing block via contain:layout),
           which is already centered via margin:0 auto in globals.css. */
        position: 'absolute',
        inset: 0,
        background: '#070e1c',
      }}
      aria-busy="true"
      aria-label="Loading OTP screen"
    />
  );
}

export default function OTPPage() {
  return (
    <Suspense fallback={<OTPFallback />}>
      <OTPScreen />
    </Suspense>
  );
}
