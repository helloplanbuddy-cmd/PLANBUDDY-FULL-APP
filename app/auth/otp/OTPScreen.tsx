'use client';
// ============================================================
// OTPScreen — OTP verification, pixel-perfect from v2.0
// ============================================================

import { useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOTP } from '@/hooks/useAuth';
import { OTP_LENGTH } from '@/types/index';
import styles from './otp.module.css';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';

export default function OTPScreen() {
  const params = useSearchParams();
  const phone = params.get('phone') ?? '';
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    otp,
    cellStates,
    isVerifying,
    isLocked,
    errText,
    showSuccess,
    timerSec,
    canResend,
    resendCapped,
    strokeDashoffset,
    CIRCUMFERENCE,
    handleInput,
    handleVerify,
    handleClear,
    handleResend,
    handleChangePhone,
  } = useOTP(phone);

  // Auto-focus hidden input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Focus input when tapping grid
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard: Enter to verify
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && otp.length === OTP_LENGTH) {
      handleVerify();
    }
  }

  // Format phone for display
  const displayPhone = phone
    ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
    : '+91 ——';

  return (
    <main
      className={styles.screen}
      role="main"
      aria-label="Verify your phone number"
    >
      {/* Success overlay */}
      <div
        className={`${styles.successOverlay} ${showSuccess ? styles.successOverlayOn : ''}`}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div className={styles.successCircle} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
            <path d="M7 15L12 20L23 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>Verified!</h2>
        <p>Taking you to your dashboard…</p>
      </div>

      {/* Back button */}
      <button
        className={styles.backBtn}
        onClick={handleChangePhone}
        aria-label="Go back to phone entry"
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
        <h1 className={styles.authH}>Verify your number</h1>

        {/* Phone row */}
        <div className={styles.otpPhoneRow}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="3" y="1" width="8" height="12" rx="1.5" stroke="var(--text-3)" strokeWidth="1.1"/>
            <circle cx="7" cy="11.2" r="0.7" fill="var(--text-3)"/>
          </svg>
          <span className={styles.otpPhoneNum} aria-live="polite">{displayPhone}</span>
          <button
            className={styles.otpChangeBtn}
            onClick={handleChangePhone}
            aria-label="Change phone number"
          >
            Change
          </button>
        </div>

        <p className={styles.authSub} style={{ marginBottom: '16px' }}>
          Enter the 6-digit OTP sent to your number
        </p>

        {/* Error banner */}
        {errText && !isLocked && (
          <div
            className={`${styles.banner} ${styles.bannerDanger}`}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <div className={styles.bannerIcon}>⚠️</div>
            <div className={styles.bannerBody}>
              <div className={styles.bannerTitle}>Verification failed</div>
              <div className={styles.bannerMsg}>{errText}</div>
            </div>
          </div>
        )}

        {/* Locked banner */}
        {isLocked && (
          <div
            className={`${styles.banner} ${styles.bannerWarn}`}
            role="alert"
            aria-live="assertive"
            style={{ flexDirection: 'column', gap: '4px' }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div className={styles.bannerIcon}>🔒</div>
              <div className={styles.bannerBody}>
                <div className={styles.bannerTitle} style={{ color: '#fcd34d' }}>
                  Account locked
                </div>
                <div className={styles.bannerMsg}>
                  Too many failed attempts. Request a new OTP.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OTP container — hidden input + visual grid */}
        <div
          className={styles.otpContainer}
          role="group"
          aria-label="6-digit OTP entry"
          onClick={focusInput}
        >
          {/* Invisible input captures all keystrokes */}
          <input
            ref={inputRef}
            type="tel"
            id="otpInput"
            className={styles.otpHidden}
            inputMode="numeric"
            maxLength={OTP_LENGTH}
            autoComplete="one-time-code"
            aria-label="Enter 6-digit OTP"
            aria-required="true"
            aria-invalid={!!errText}
            aria-describedby="otpErrText"
            pattern="[0-9]*"
            value={otp}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isLocked || isVerifying || showSuccess}
          />

          {/* Visual digit grid */}
          <div className={styles.otpGrid} aria-hidden="true">
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`${styles.otpCell} ${
                  cellStates[i] === 'active'  ? styles.otpCellActive  :
                  cellStates[i] === 'filled'  ? styles.otpCellFilled  :
                  cellStates[i] === 'err'     ? styles.otpCellErr     :
                  cellStates[i] === 'ok'      ? styles.otpCellOk      :
                  cellStates[i] === 'locked'  ? styles.otpCellLocked  : ''
                }`}
              >
                {otp[i] ?? ''}
              </div>
            ))}
          </div>
        </div>

        {/* Error row */}
        <div className={styles.otpErrRow}>
          <div
            id="otpErrText"
            className={`${styles.otpErrText} ${errText ? styles.otpErrTextOn : ''}`}
            role="alert"
            aria-live="assertive"
          >
            {errText}
          </div>
          {errText && (
            <button
              className={styles.otpClearLink}
              onClick={handleClear}
              aria-label="Clear OTP and retry"
            >
              Clear &amp; retry
            </button>
          )}
        </div>

        {/* Timer row */}
        <div className={`${styles.timerRow} ${timerSec > 0 && !canResend ? '' : ''}`}>
          <div
            className={styles.timerLeft}
            aria-live="polite"
            aria-label="Resend countdown"
            style={{ visibility: canResend ? 'hidden' : 'visible', pointerEvents: canResend ? 'none' : 'auto' }}
          >
            <div className={styles.timerRing} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 22 22">
                <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2"/>
                <circle
                  cx="11" cy="11" r="9"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  strokeDasharray={`${CIRCUMFERENCE}`}
                  strokeDashoffset={`${strokeDashoffset}`}
                  strokeLinecap="round"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
            </div>
            <span>Resend in <strong>{timerSec}</strong>s</span>
          </div>
          <button
            className={`${styles.resendBtn} ${canResend && !resendCapped && !isLocked ? styles.resendBtnReady : ''}`}
            onClick={handleResend}
            disabled={!canResend || resendCapped || isLocked}
            aria-label="Resend OTP"
          >
            {resendCapped ? 'Max resends reached' : 'Resend OTP'}
          </button>
        </div>

        {/* Verify CTA */}
        <button
          className={styles.btn}
          onClick={handleVerify}
          disabled={otp.length < OTP_LENGTH || isVerifying || isLocked || showSuccess}
          aria-label="Verify OTP and continue"
          aria-disabled={otp.length < OTP_LENGTH || isVerifying || isLocked}
        >
          <span className={styles.btnLabel} id="verifyLabel">
            {isVerifying ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Verifying…
              </>
            ) : (
              'Verify & Continue'
            )}
          </span>
        </button>

        {/* Keyboard pad spacer */}
        <div className={styles.keyboardPad} aria-hidden="true" />
      </div>
    </main>
  );
}
