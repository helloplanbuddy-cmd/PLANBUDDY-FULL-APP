'use client';
// ============================================================
// hooks/useAuth.ts — Auth FSM: phone → OTP → dashboard
// Phase 2: Calls real /api/auth/* endpoints, no demo OTP
// ============================================================

import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  STORAGE_KEYS,
  OTP_LENGTH,
  OTP_TIMER_SECONDS,
  MAX_OTP_ATTEMPTS,
  MAX_RESEND_COUNT,
} from '@/types/index';
import { useAppStore } from '@/store/appStore';
import { ClientAnalytics } from '@/app/providers/AnalyticsProvider';
import { AuthService } from '@/src/services/auth.service';
import { ApiError } from '@/lib/apiClient';

// ── Helpers ────────────────────────────────────────────────
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* noop */ }
}

// ── usePhone hook ──────────────────────────────────────────
export function usePhone() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fieldState, setFieldState] = useState<'idle' | 'valid' | 'err'>('idle');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [savedPhone, setSavedPhone] = useState('');

  useEffect(() => {
    const saved = lsGet(STORAGE_KEYS.SAVED_PHONE);
    if (saved) setSavedPhone(saved);
  }, []);

  function validate(value: string): boolean {
    return /^[6-9]\d{9}$/.test(value);
  }

  function handleChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setError('');
    if (digits.length === 0) setFieldState('idle');
    else if (digits.length === 10) {
      setFieldState(validate(digits) ? 'valid' : 'err');
    } else {
      setFieldState('idle');
    }
  }

  function handleClear() {
    setPhone('');
    setFieldState('idle');
    setError('');
  }

  async function handleSendOTP() {
    if (!validate(phone)) {
      setFieldState('err');
      setError('Enter a valid 10-digit number starting with 6, 7, 8, or 9');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      await AuthService.sendOtp(phone);

      lsSet(STORAGE_KEYS.SAVED_PHONE, phone);
      // Phase 2E: track login_started when OTP sends successfully
      ClientAnalytics.track('login_started', { phone_masked: phone.slice(0,4) + '****' });
      router.push(`/auth/otp?phone=${encodeURIComponent(phone)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(err.message || "Couldn't send OTP. Please try again.");
      } else {
        setError("Couldn't send OTP. Please check your connection and try again.");
      }
    } finally {
      setIsSending(false);
    }
  }

  const isValid = validate(phone);

  return {
    phone,
    savedPhone,
    fieldState,
    error,
    isSending,
    isLocked: false,
    lockCountdown: '',
    isValid,
    handleChange,
    handleClear,
    handleSendOTP,
  };
}

// ── useOTP hook ────────────────────────────────────────────
export function useOTP(phone: string) {
  const router = useRouter();
  const setAuth = useAppStore((s) => s.setAuth);
  const [otp, setOtp] = useState('');
  const [cellStates, setCellStates] = useState<
    Array<'idle' | 'active' | 'filled' | 'err' | 'ok' | 'locked'>
  >(Array(OTP_LENGTH).fill('idle'));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [errText, setErrText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [timerSec, setTimerSec] = useState(OTP_TIMER_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [resendCapped, setResendCapped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerSec(OTP_TIMER_SECONDS);
    setCanResend(false);
    timerRef.current = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    if (isLocked) return;
    const len = otp.length;
    setCellStates(
      Array.from({ length: OTP_LENGTH }, (_, i) => {
        if (i < len) return 'filled';
        if (i === len) return 'active';
        return 'idle';
      })
    );
  }, [otp, isLocked]);

  function handleInput(value: string) {
    if (isLocked || isVerifying) return;
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    setErrText('');
  }

  async function handleVerify() {
    if (otp.length < OTP_LENGTH || isVerifying || isLocked) return;

    setIsVerifying(true);
    setErrText('');

    try {
      const data = await AuthService.verifyOtp(phone, otp);

      // Store access token in memory (cookie is set by server)
      // Also update Zustand store for client-side auth state
      setCellStates(Array(OTP_LENGTH).fill('ok'));
      setShowSuccess(true);

      setAuth({
        phone,
        token: data.accessToken,
        createdAt: Date.now(),
        userId: data.userId,
      });

      // Phase 2E: track login_success + profile_updated (profile set on login)
      ClientAnalytics.track('login_success', { userId: data.userId });
      ClientAnalytics.track('profile_updated', { trigger: 'login', userId: data.userId });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1400);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setIsLocked(true);
        setCellStates(Array(OTP_LENGTH).fill('locked'));
        setErrText('Too many attempts. Please wait before trying again.');
        setIsVerifying(false);
        return;
      }

      if (err instanceof ApiError && err.status !== 0) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        // Phase 2E: track login_failed
        ClientAnalytics.track('login_failed', { attempts: newAttempts });
        if (newAttempts >= MAX_OTP_ATTEMPTS) {
          setIsLocked(true);
          setCellStates(Array(OTP_LENGTH).fill('locked'));
          setErrText('Too many attempts. Please request a new OTP.');
        } else {
          setCellStates(Array(OTP_LENGTH).fill('err'));
          setErrText(err.message || 'Incorrect OTP. Please try again.');
        }
        setIsVerifying(false);
        return;
      }

      setErrText("Verification failed — please check your connection.");
      setIsVerifying(false);
    }
  }

  function handleClear() {
    if (isLocked) return;
    setOtp('');
    setErrText('');
    setCellStates(
      Array.from({ length: OTP_LENGTH }, (_, i) => (i === 0 ? 'active' : 'idle'))
    );
  }

  async function handleResend() {
    if (!canResend || resendCapped || isLocked) return;
    const newCount = resendCount + 1;
    setResendCount(newCount);
    if (newCount >= MAX_RESEND_COUNT) setResendCapped(true);
    handleClear();
    setAttempts(0);
    setErrText('');
    startTimer();

    // Actually resend OTP
    try {
      await AuthService.sendOtp(phone);
    } catch {
      // Silently fail — timer already reset
    }
  }

  function handleChangePhone() {
    router.push('/auth/phone');
  }

  const ringProgress = timerSec / OTP_TIMER_SECONDS;
  const CIRCUMFERENCE = 56.5;
  const strokeDashoffset = CIRCUMFERENCE * (1 - ringProgress);

  return {
    otp,
    cellStates,
    isVerifying,
    isLocked,
    errText,
    showSuccess,
    timerSec,
    canResend,
    resendCapped,
    ringProgress,
    strokeDashoffset,
    CIRCUMFERENCE,
    handleInput,
    handleVerify,
    handleClear,
    handleResend,
    handleChangePhone,
  };
}

// ── useSessionRefresh hook — auto token refresh ────────────
export function useSessionRefresh() {
  const setAuth       = useAppStore((s) => s.setAuth);
  const clearAuth     = useAppStore((s) => s.clearAuth);
  const clearUserData = useAppStore((s) => s.clearUserData);
  const auth = useAppStore((s) => s.auth);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await AuthService.refreshSession();

      setAuth({
        phone:     data.phone ?? auth?.phone ?? '',
        token:     data.accessToken ?? '',
        createdAt: Date.now(),
        userId:    data.userId ?? auth?.userId ?? '',
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        // Phase 2E Fix B: clear user data on session expiry, not just auth token
        clearUserData();
        clearAuth();
      }
      return false;
    }
  }, [setAuth, clearAuth, clearUserData, auth]);

  // Auto-refresh: 12 minutes (access token is 15 min)
  useEffect(() => {
    if (!auth) return;

    const interval = setInterval(() => {
      refresh();
    }, 12 * 60 * 1000);

    return () => clearInterval(interval);
  }, [auth, refresh]);

  return { refresh };
}
