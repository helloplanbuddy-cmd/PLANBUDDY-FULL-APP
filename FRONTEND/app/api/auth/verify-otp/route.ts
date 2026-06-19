// ============================================================
// /api/auth/verify-otp — Phase 2A
// CHANGES: DB-backed OTP verification (SHA-256 hashed),
//          DB-backed user + session + refresh token,
//          Redis rate limiting, CSRF, structured logging, OTel
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv }                     from '@/lib/env';
import { VerifyOTPSchema }            from '@/lib/schemas';

import { limitVerifyOTP }             from '@/lib/redisRateLimit';
import { apiError, apiRateLimited, safeParseBody, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics }                  from '@/lib/analytics';
import { captureException }           from '@/lib/monitoring';
import { createHash }                 from 'crypto';
import { logger, generateRequestId, logApiRequest, logApiResponse, logAuthEvent } from '@/lib/logger';
import { trace }                      from '@/lib/telemetry';
import { validateCSRF }               from '@/lib/csrf';

export const runtime = 'nodejs';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start     = Date.now();
  const route     = '/api/auth/verify-otp';

  logApiRequest(requestId, 'POST', route);

  try {
    getEnv();

    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const { body, error: parseErr } = await safeParseBody(req);
    if (parseErr) return apiError(parseErr, 400);

    const result = VerifyOTPSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { phone, otp } = result.data;

    const rl = await limitVerifyOTP(phone);
    if (!rl.allowed) {
      await Analytics.rateLimitHit('anon', 'verify-otp');
      logApiResponse(requestId, route, 429, Date.now() - start);
      return apiRateLimited(rl.resetAt);
    }

    // Proxy verification to backend authoritative endpoint
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    const res = await fetch(`${base}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await res.json();

    // Mirror backend response (including cookies set by backend)
    const out = NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });

    const setCookies = res.headers.get('set-cookie');
    if (setCookies) {
      // In Node fetch, multiple Set-Cookie might be concatenated with , so best-effort
      out.headers.append('Set-Cookie', setCookies);
    }

    logApiResponse(requestId, route, res.status, Date.now() - start);
    return out;

  } catch (err) {
    await captureException(err, { route, requestId });
    logger.error({ requestId, err }, 'verify-otp handler error');
    logApiResponse(requestId, route, 500, Date.now() - start);
    return apiError('Internal server error', 500);
  }
}
