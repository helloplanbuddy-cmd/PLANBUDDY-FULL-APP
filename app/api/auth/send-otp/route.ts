// ============================================================
// /api/auth/send-otp — Phase 2A
// CHANGES: DB-backed OTP storage, Redis rate limiting,
//          CSRF validation, structured logging, OTel tracing,
//          per-IP rate limiting, SHA-256 OTP hashing
// ============================================================

import { type NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';
import { SendOTPSchema } from '@/lib/schemas';
import { limitSendOTP, limitSendOTPByIP } from '@/lib/redisRateLimit';
import { apiOk, apiError, apiRateLimited, safeParseBody } from '@/lib/apiHelpers';
import { Analytics } from '@/lib/analytics';
import { captureException } from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { validateCSRF } from '@/lib/csrf';
import { sendOTP } from '@/lib/sms';
import { storeOTP, generateDeviceId } from '@/lib/dbSessionStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  const route = '/api/auth/send-otp';

  logApiRequest(requestId, 'POST', route);

  try {
    getEnv();

    const csrfError = validateCSRF(req);
    if (csrfError) {
      logApiResponse(requestId, route, 403, Date.now() - start);
      return csrfError;
    }

    const { body, error: parseErr } = await safeParseBody(req);
    if (parseErr) return apiError(parseErr, 400);

    const result = SendOTPSchema.safeParse(body);
    if (!result.success) return apiError(result.error.issues[0].message, 400);

    const { phone } = result.data;

    const rlPhone = await limitSendOTP(phone);
    if (!rlPhone.allowed) {
      await Analytics.rateLimitHit('anon', 'send-otp');
      logApiResponse(requestId, route, 429, Date.now() - start);
      return apiRateLimited(rlPhone.resetAt);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';
    const rlIP = await limitSendOTPByIP(ip);
    if (!rlIP.allowed) {
      logApiResponse(requestId, route, 429, Date.now() - start);
      return apiRateLimited(rlIP.resetAt);
    }

    const deviceId = generateDeviceId();
    const { otp, success } = await sendOTP(phone);
    if (!success) {
      logger.warn({ requestId, phone: phone.slice(0, 4) + '****' }, 'OTP delivery failed');
      return apiError('Failed to send OTP', 502);
    }

    await storeOTP(phone, otp, { ipAddress: ip, deviceId });
    await Analytics.otpSent(phone);

    logApiResponse(requestId, route, 200, Date.now() - start);
    return apiOk({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    await captureException(err, { route, requestId });
    logger.error({ requestId, err }, 'send-otp handler error');
    logApiResponse(requestId, route, 500, Date.now() - start);
    return apiError('Internal server error', 500);
  }
}
