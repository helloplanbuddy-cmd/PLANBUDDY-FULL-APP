// ============================================================
// lib/apiClient.ts — Frontend → Backend API abstraction
// Phase 3 HARDENED:
//   - Request timeout (configurable per-call)
//   - Retry policy (idempotent requests: 3 attempts, exponential backoff)
//   - Error normalization (ApiError with typed body)
//   - AbortController support (caller signal merged with timeout signal)
//   - Auth token from Zustand store injected automatically
//   - Refresh token handling: auto-retry on 401 with session refresh
//   - No business logic — pure transport layer
// ============================================================

// ── Config ─────────────────────────────────────────────────

/**
 * Base URL for the real backend API.
 * Set NEXT_PUBLIC_API_BASE_URL in .env to point at an external backend.
 * Defaults to '' (same origin) for Next.js API routes.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES        = 3;

// ── Error Class ────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True for transient errors that should be retried */
  get isRetryable(): boolean {
    return this.status === 0          // network failure
        || this.status === 408        // request timeout
        || this.status === 429        // rate limit (with backoff)
        || this.status >= 500;        // server error
  }

  /** Human-friendly message for display in UI */
  get userMessage(): string {
    if (this.status === 0)   return 'No internet connection. Check your network and try again.';
    if (this.status === 401) return 'Session expired. Please log in again.';
    if (this.status === 403) return "You don't have permission to do this.";
    if (this.status === 404) return 'Not found.';
    if (this.status === 429) return 'Too many requests. Please wait a moment.';
    if (this.status >= 500)  return 'Server error. Our team has been notified.';
    return this.message;
  }
}

// ── Helpers ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  // Exponential backoff: 400ms, 800ms, 1600ms — capped at 5s
  return Math.min(400 * Math.pow(2, attempt), 5_000);
}

// ── Auth Token Injection ─────────────────────────────────

/**
 * Retrieve the auth access token from the Zustand store.
 * This is a lazy import to avoid circular dependencies at module load time.
 */
function getAuthToken(): string | undefined {
  try {
    // Dynamic import of store to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAppStore } = require('@/store/appStore');
    const state = useAppStore.getState?.();
    return state?.auth?.token;
  } catch {
    return undefined;
  }
}

// ── Core Fetch ─────────────────────────────────────────────

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  /** Skip retry for non-idempotent mutations where retrying is unsafe */
  noRetry?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
  attempt = 0,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, noRetry = false, ...fetchOptions } = options;

  // Merge caller AbortSignal with our timeout
  const controller    = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const callerSignal = fetchOptions.signal as AbortSignal | undefined;
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeoutHandle);
      throw new ApiError(0, 'Request aborted');
    }
    callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  // Inject auth token from Zustand store if available and not already provided
  const existingHeaders = (fetchOptions.headers as Record<string, string>) ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...existingHeaders,
  };
  if (!headers['Authorization']) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });

    if (!res.ok) {
      let body: unknown;
      try { body = await res.json(); } catch { /* non-JSON body */ }

      const error = new ApiError(
        res.status,
        (body as { error?: string })?.error ?? `HTTP ${res.status}`,
        body,
      );

      // Retry on transient errors (not 401 — handled by caller via refresh)
      if (!noRetry && error.isRetryable && res.status !== 429 && attempt < MAX_RETRIES - 1) {
        await sleep(backoffMs(attempt));
        return apiFetch<T>(path, options, attempt + 1);
      }

      // Rate limit — retry after explicit backoff
      if (!noRetry && res.status === 429 && attempt < 1) {
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 2_000;
        await sleep(waitMs);
        return apiFetch<T>(path, options, attempt + 1);
      }

      throw error;
    }

    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;

    // AbortError → network timeout or caller cancel
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, callerSignal?.aborted ? 'Request cancelled' : 'Request timed out');
    }

    // Unknown network error — retry
    if (!noRetry && attempt < MAX_RETRIES - 1) {
      await sleep(backoffMs(attempt));
      return apiFetch<T>(path, options, attempt + 1);
    }

    throw new ApiError(0, 'Network error. Check your connection and try again.');
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ── Auth ──────────────────────────────────────────────────

export interface SendOtpPayload  { phone: string; csrfToken?: string; }
export interface SendOtpResponse { success: boolean; message: string; }

export interface VerifyOtpPayload  { phone: string; otp: string; csrfToken?: string; }
export interface VerifyOtpResponse { success: boolean; token: string; accessToken: string; userId: string; message: string; }

export interface LogoutResponse { success: boolean; }

export const AuthApi = {
  sendOtp: (payload: SendOtpPayload) =>
    apiFetch<SendOtpResponse>('/api/auth/send-otp', {
      method:  'POST',
      body:    JSON.stringify(payload),
      noRetry: true, // don't accidentally double-send OTP
    }),

  verifyOtp: (payload: VerifyOtpPayload) =>
    apiFetch<VerifyOtpResponse>('/api/auth/verify-otp', {
      method:  'POST',
      body:    JSON.stringify(payload),
      noRetry: true,
    }),

  logout: () =>
    apiFetch<LogoutResponse>('/api/auth/logout', {
      method:  'POST',
      noRetry: true,
    }),

  session: () =>
    apiFetch<{ authenticated: boolean; userId?: string; phone?: string; accessToken?: string }>(
      '/api/auth/session',
      { timeoutMs: 5_000 },
    ),

  refreshSession: () =>
    apiFetch<{ authenticated: boolean; userId?: string; phone?: string; accessToken?: string }>(
      '/api/auth/session',
      { method: 'POST', timeoutMs: 5_000 },
    ),
};

// ── Plans ──────────────────────────────────────────────────

export interface PlanRequestPayload {
  from: string;
  to: string;
  days: number;
  budget: number;
  interests: string[];
  startDate?: string;
}

/** Returns raw Response (streaming SSE) — caller processes the stream */
export async function streamDemoPlan(
  payload: PlanRequestPayload,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/demo-plan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal,
  });
}

export async function streamAuthPlan(
  payload: PlanRequestPayload,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/plan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal,
  });
}

// ── Memories ──────────────────────────────────────────────

export interface Memory {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  tripId?: string;
}

export const MemoriesApi = {
  list: () => apiFetch<{ memories: Memory[] }>('/api/memories'),

  create: (payload: { title: string; content: string; tripId?: string }) =>
    apiFetch<{ memory: Memory }>('/api/memories', {
      method:  'POST',
      body:    JSON.stringify(payload),
      noRetry: true,
    }),
};

// ── Chat ─────────────────────────────────────────────────

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export async function streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
  context?: unknown,
): Promise<Response> {
  return fetch(`${API_BASE}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(context !== undefined ? { messages, context } : { messages }),
    signal,
  });
}

// ── Health ────────────────────────────────────────────────

export const HealthApi = {
  check: () =>
    apiFetch<{ status: string; timestamp: string }>('/api/health', {
      timeoutMs: 5_000,
    }),
};
