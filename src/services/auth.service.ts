// ============================================================
// src/services/auth.service.ts — Auth API service layer
// Phase 2: All auth API calls go through here.
// No business logic in components. Strong typing. Error normalization.
// ============================================================

import { ApiError, apiFetch as clientFetch } from '@/lib/apiClient';
import type {
  AuthResponse,
  OTPResponse,
  SessionResponse,
} from '@/src/types/api';

const TIMEOUT_MS = 15_000;

async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    return await clientFetch<T>(path, {
      method:    'POST',
      body:      JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
      noRetry:   true,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      const data = (err.body ?? {}) as { resetAt?: number };
      const wait = data.resetAt
        ? `Too many attempts. Try again in ${Math.ceil((data.resetAt - Date.now()) / 60000)} min.`
        : 'Too many attempts. Try again later.';
      throw new ApiError(429, wait, data);
    }
    throw err;
  }
}

async function get<T>(path: string, opts: { token?: string; timeoutMs?: number } = {}): Promise<T> {
  return clientFetch<T>(path, {
    method:    'GET',
    timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
    headers:   opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
  });
}

export const AuthService = {
  /** Send OTP to a phone number */
  sendOtp: (phone: string): Promise<AuthResponse> =>
    post<AuthResponse>('/api/auth/send-otp', { phone }),

  /** Verify OTP and obtain session tokens */
  verifyOtp: (phone: string, otp: string): Promise<OTPResponse> =>
    post<OTPResponse>('/api/auth/verify-otp', { phone, otp }),

  /** Logout and invalidate server session */
  logout: (): Promise<{ success: boolean }> =>
    clientFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST', timeoutMs: 4_000, noRetry: true }),

  /** Get current session. Pass a bearer token to verify a local access token. */
  getSession: (token?: string): Promise<SessionResponse> =>
    get<SessionResponse>('/api/auth/session', { token, timeoutMs: 5_000 }),

  /** Silently refresh access token via refresh cookie */
  refreshSession: (): Promise<SessionResponse> =>
    clientFetch<SessionResponse>('/api/auth/session', { method: 'POST', timeoutMs: 5_000, noRetry: true }),
};
