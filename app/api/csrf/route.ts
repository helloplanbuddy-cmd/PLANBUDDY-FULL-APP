// ============================================================
// /api/csrf — CSRF token endpoint (Phase 2A)
// GET returns a fresh CSRF token and sets the cookie.
// ============================================================

import { type NextRequest } from 'next/server';
import { setCSRFCookie, validateCSRF } from '@/lib/csrf';
import { apiOk, apiError } from '@/lib/apiHelpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // Only allow same-origin via origin check
    const origin = req.headers.get('origin');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    if (origin && origin !== appUrl && !origin.includes('localhost')) {
      return apiError('Forbidden', 403);
    }

    const res = apiOk({ csrfToken: '' });
    const token = setCSRFCookie(res);
    // Also return as JSON for clients that read from body
    return apiOk({ csrfToken: token });
  } catch (err) {
    return apiError('Internal server error', 500);
  }
}
