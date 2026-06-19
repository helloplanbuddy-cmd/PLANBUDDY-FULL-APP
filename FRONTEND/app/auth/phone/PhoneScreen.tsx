'use client';
// ============================================================
// PhoneScreen — Phone number entry, pixel-perfect from v2.0
// ============================================================

import { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePhone } from '@/hooks/useAuth';
import styles from './phone.module.css';

export default function PhoneScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    phone,
    savedPhone,
    fieldState,
    error,
    isSending,
    isLocked,
    lockCountdown,
    isValid,
    handleChange,
    handleClear,
    handleSendOTP,
  } = usePhone();

  // Auto-focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Keyboard submit
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && isValid && !isSending) {
      handleSendOTP();
    }
  }

  return (
    <main
      className={styles.screen}
      role="main"
      aria-label="Enter your phone number"
    >
      {/* Skip link */}
      <a className={styles.skipLink} href="#phoneInput">
        Skip to phone input
      </a>

      {/* Back button — context-aware: /demo-trip-generator if demo seen, else /onboarding */}
      <button
        className={styles.backBtn}
        onClick={() => {
          try {
            const demoSeen = localStorage.getItem('pb_demo_seen') === 'true';
            router.push(demoSeen ? '/demo-trip-generator' : '/onboarding');
          } catch {
            router.push('/onboarding');
          }
        }}
        aria-label="Go back"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M14 4L8 11L14 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Scrollable inner */}
      <div className={styles.authInner}>
        {/* Brand */}
        <div className={styles.authBrand} aria-hidden="true">PlanBuddy</div>

        {/* Heading */}
        <h1 className={styles.authH}>Start planning instantly</h1>
        <p className={styles.authSub}>
          Enter your number. We&apos;ll send an OTP — no password, no spam.
        </p>

        {/* Value proposition block */}
        <div className={styles.valueBlock} aria-label="Why sign in with us">
          <div className={styles.valueIcon} aria-hidden="true">⚡</div>
          <div>
            <div className={styles.valueMain}>Trip ready in 30 seconds</div>
            <div className={styles.valueSub}>2.4 lakh+ travelers · No signup form · OTP only</div>
          </div>
        </div>

        {/* Saved phone restore badge */}
        {savedPhone && phone === '' && (
          <div className={styles.restoreBadge} aria-live="polite">
            <span>↩</span>
            <span>Welcome back — number pre-filled</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className={`${styles.banner} ${styles.bannerDanger}`} role="alert" aria-live="assertive" aria-atomic="true">
            <div className={styles.bannerIcon}>⚠️</div>
            <div className={styles.bannerBody}>
              <div className={styles.bannerTitle}>Something went wrong</div>
              <div className={styles.bannerMsg}>{error}</div>
              <button className={styles.bannerRetry} onClick={handleSendOTP} aria-label="Retry sending OTP">
                Tap to retry →
              </button>
            </div>
          </div>
        )}

        {/* Locked banner */}
        {isLocked && (
          <div className={styles.lockedBanner} role="alert" aria-live="assertive">
            <h3>🔒 Account temporarily locked</h3>
            <p>Too many failed attempts. Please wait before trying again.</p>
            <div className={styles.lockedCountdown} aria-live="polite">
              {lockCountdown || '--:--'}
            </div>
          </div>
        )}

        {/* Phone input */}
        <div className={styles.phoneWrap}>
          <label htmlFor="phoneInput" className="sr-only">
            Indian mobile number (10 digits)
          </label>
          <div
            className={`${styles.phoneField} ${
              fieldState === 'valid' ? styles.phoneFieldValid :
              fieldState === 'err'  ? styles.phoneFieldErr   : ''
            } ${isLocked ? styles.phoneFieldLocked : ''}`}
          >
            {/* Country code */}
            <div className={styles.cc} aria-label="India +91">
              <span className={styles.flag} aria-hidden="true">🇮🇳</span>
              <span>+91</span>
            </div>

            {/* Number input */}
            <input
              ref={inputRef}
              type="tel"
              id="phoneInput"
              inputMode="numeric"
              placeholder="10-digit number"
              maxLength={10}
              autoComplete="tel-national"
              aria-label="Mobile number"
              aria-describedby="phoneFieldErr"
              aria-required="true"
              aria-invalid={fieldState === 'err'}
              value={phone}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isLocked}
            />

            {/* Clear button */}
            {phone.length > 0 && (
              <button
                className={styles.clearBtn}
                onClick={handleClear}
                tabIndex={-1}
                aria-label="Clear number"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="6.5" fill="currentColor" opacity="0.18"/>
                  <path d="M5 5L10 10M10 5L5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Field error */}
          <div
            id="phoneFieldErr"
            className={`${styles.fieldErr} ${fieldState === 'err' ? styles.fieldErrOn : ''}`}
            role="alert"
            aria-live="polite"
          >
            Enter a valid 10-digit number starting with 6, 7, 8, or 9
          </div>
        </div>

        {/* Trust signals */}
        <div className={styles.trustRow} aria-label="Trust signals">
          <div className={styles.trustChip}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1.5L2.5 3.5V7C2.5 9.5 4.5 11.8 7 12.5C9.5 11.8 11.5 9.5 11.5 7V3.5Z" stroke="#05ca99" strokeWidth="1.2"/>
              <path d="M5 7L6.5 8.5L9.5 5.5" stroke="#05ca99" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            No spam, ever
          </div>
          <div className={styles.trustChip}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="#05ca99" strokeWidth="1.2"/>
              <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#05ca99" strokeWidth="1.2"/>
            </svg>
            Number stays private
          </div>
          <div className={styles.trustChip}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" stroke="#05ca99" strokeWidth="1.2"/>
              <path d="M5 7L6.5 8.5L9.5 5.5" stroke="#05ca99" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Free forever
          </div>
        </div>

        {/* Terms */}
        <div className={styles.terms}>
          By continuing you agree to our{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>Terms</a> &amp;{' '}
          <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
        </div>

        {/* CTA */}
        <button
          className={styles.btn}
          onClick={handleSendOTP}
          disabled={!isValid || isSending || isLocked}
          aria-label="Send OTP to my number"
          aria-disabled={!isValid || isSending || isLocked}
        >
          <span className={styles.btnLabel}>
            {isSending ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Sending…
              </>
            ) : (
              'Get OTP →'
            )}
          </span>
        </button>

        {/* Fix #7: Google SSO hidden until backend OAuth support is implemented */}

        {/* Keyboard pad spacer */}
        <div className={styles.keyboardPad} aria-hidden="true" />
      </div>
    </main>
  );
}
