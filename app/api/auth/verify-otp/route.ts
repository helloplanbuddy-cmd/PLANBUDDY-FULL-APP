// ============================================================
// /api/auth/verify-otp — Phase 2A
// CHANGES: DB-backed OTP verification (SHA-256 hashed),
//          DB-backed user + session + refresh token,
//          Redis rate limiting, CSRF, structured logging, OTel
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { VerifyOTPSchema } from '@/lib/schemas';
import { limitVerifyOTP } from '@/lib/redisRateLimit';
import { apiError, apiRateLimited, safeParseBody, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics } from '@/lib/analytics';
import { captureException } from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse, logAuthEvent } from '@/lib/logger';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import { validateCSRF } from '@/lib/csrf';
import {
  verifyOTPHash,
  getOrCreateUser,
  createDeviceSession,
  storeRefreshFamily,
  generateFamily,
  generateDeviceId,
} from '@/lib/dbSessionStore';

export const runtime = 'nodejs';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  const route = '/api/auth/verify-otp';

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

    const verifyResult = await verifyOTPHash(phone, otp);
    if (!verifyResult.valid) {
      if (verifyResult.locked) {
        return apiError('Too many failed attempts. Request a new OTP.', 429);
      }
      return apiError('Invalid or expired OTP', 401);
    }

    const user = await getOrCreateUser(phone);
    const deviceId = generateDeviceId();
    const sessionId = await createDeviceSession(user.id, {
      deviceId,
      deviceName: 'web',
      deviceType: 'desktop',
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip')
        ?? 'unknown',
      userAgent: req.headers.get('user-agent') ?? null,
    });
    const family = generateFamily();
    const accessToken = await signAccessToken(user.id, user.phone, deviceId);
    const refreshToken = await signRefreshToken(user.id, family);
    await storeRefreshFamily(family, user.id, refreshToken, sessionId);

    await Analytics.otpVerified(user.id);
    logAuthEvent('otp_verified', user.id, { phone: phone.slice(0, 4) + '****' });

    const response = NextResponse.json(
      {
        success: true,
        message: 'OTP verified successfully',
        accessToken,
        userId: user.id,
        phone: user.phone,
      },
      { status: 200, headers: SECURITY_HEADERS }
    );

    const accessCookie = [
      '__access=' + accessToken,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=900',
      IS_PROD ? 'Secure' : '',
    ].filter(Boolean).join('; ');
    const refreshCookie = [
      '__refresh=' + refreshToken,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=604800',
      IS_PROD ? 'Secure' : '',
    ].filter(Boolean).join('; ');

    response.headers.append('Set-Cookie', accessCookie);
    response.headers.append('Set-Cookie', refreshCookie);

    logApiResponse(requestId, route, 200, Date.now() - start);
    return response;
  } catch (err) {
    await captureException(err, { route, requestId });
    logger.error({ requestId, err }, 'verify-otp handler error');
    logApiResponse(requestId, route, 500, Date.now() - start);
    return apiError('Internal server error', 500);
  }
}
