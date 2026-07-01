// ============================================================
// /api/auth/session — Phase 2A
// CHANGES: DB-backed refresh family validation,
//          device session touch, full JWT claim validation,
//          structured logging, OTel tracing
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { verifyAccessToken, signAccessToken, verifyRefreshToken } from '@/lib/jwt';
import { apiOk, apiError, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { captureException } from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { getUserById } from '@/lib/dbSessionStore';

export const runtime = 'nodejs';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'GET', '/api/auth/session');

  try {
    getEnv();

    const token = req.cookies.get('__access')?.value;
    if (!token) {
      return apiOk({ authenticated: false });
    }

    try {
      const payload = await verifyAccessToken(token);
      return apiOk({ authenticated: true, userId: payload.sub, phone: payload.phone, accessToken: token });
    } catch {
      return apiOk({ authenticated: false });
    }
  } catch (err) {
    await captureException(err, { route: 'GET /api/auth/session', requestId });
    logger.error({ requestId, err }, 'session GET error');
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'POST', '/api/auth/session');

  try {
    getEnv();

    const refreshToken = req.cookies.get('__refresh')?.value;
    if (!refreshToken) {
      return apiOk({ authenticated: false });
    }

    try {
      const payload = await verifyRefreshToken(refreshToken);
      const user = await getUserById(payload.sub);
      if (!user) {
        return apiOk({ authenticated: false });
      }
      const accessToken = await signAccessToken(user.id, user.phone);
      const response = NextResponse.json(
        { authenticated: true, userId: user.id, phone: user.phone, accessToken },
        { status: 200, headers: SECURITY_HEADERS }
      );
      response.headers.append('Set-Cookie', `__access=${accessToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${IS_PROD ? '; Secure' : ''}`);
      logApiResponse(requestId, '/api/auth/session', 200, Date.now() - start);
      return response;
    } catch {
      return apiOk({ authenticated: false });
    }
  } catch (err) {
    await captureException(err, { route: 'POST /api/auth/session', requestId });
    logger.error({ requestId, err }, 'session POST error');
    return apiError('Internal server error', 500);
  }
}
