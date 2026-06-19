// ============================================================
// lib/security.ts — Frontend security utilities
// Phase 9: Centralized security helpers
//   - CSRF token fetching
//   - Input sanitization (prevent XSS)
//   - Safe redirect validation
//   - Token storage (memory-first, no raw localStorage tokens)
// ============================================================

// ── CSRF ─────────────────────────────────────────────────

let _csrfToken: string | null = null;

/**
 * Fetch CSRF token from server (cached per-session).
 * Call before any state-mutating API request.
 * Gracefully returns empty string if /api/csrf endpoint is not available
 * (e.g. during static export or server-side rendering).
 */
export async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;

  // Skip CSRF token fetch during SSR/static generation
  if (typeof window === 'undefined') return '';

  try {
    const timeoutMs = 5_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('/api/csrf', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as { csrfToken?: string };
      _csrfToken = data.csrfToken || '';
      return _csrfToken;
    }
  } catch {
    // CSRF fetch failed — return empty string; server will reject if needed
  }
  return '';
}

/** Invalidate cached CSRF token (e.g. after logout) */
export function clearCsrfToken(): void {
  _csrfToken = null;
}

// ── Input Sanitization ────────────────────────────────────

/**
 * Strip HTML tags from user input to prevent XSS injection.
 * Use before displaying user-supplied content as innerHTML.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate and sanitize a phone number.
 * Returns digits-only string or null if invalid Indian mobile.
 */
export function sanitizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

/**
 * Validate that a redirect URL is safe (same-origin or whitelisted).
 * Prevents open redirect attacks.
 */
export function isSafeRedirect(url: string): boolean {
  // Relative URLs are always safe
  if (url.startsWith('/') && !url.startsWith('//')) return true;

  try {
    const parsed  = new URL(url);
    const current = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    if (!current) return false;
    return parsed.origin === current.origin;
  } catch {
    return false;
  }
}

// ── Memory-only Token Holder ──────────────────────────────

/**
 * In-memory access token holder.
 * Tokens are NEVER written to localStorage — only cookies (HttpOnly) and memory.
 * This prevents XSS from stealing tokens via localStorage.
 */
let _memoryToken: string | null = null;

export const TokenStore = {
  set: (token: string) => { _memoryToken = token; },
  get: () => _memoryToken,
  clear: () => { _memoryToken = null; },
};
