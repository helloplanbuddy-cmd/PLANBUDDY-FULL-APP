// ============================================================
// /api/auth/logout — Phase 2A
// CHANGES: DB-backed family revocation, session revocation,
//          structured logging, CSRF validation
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { verifyRefreshToken }  from '@/lib/jwt';
import {
  revokeRefreshFamily,
  revokeSession,
  getSessionIdFromFamily,
}                              from '@/lib/dbSessionStore';
import { requireAuth }         from '@/lib/authMiddleware';
import { apiOk, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics }           from '@/lib/analytics';
import { captureException }    from '@/lib/monitoring';
import { logger, generateRequestId, logAuthEvent } from '@/lib/logger';
import { validateCSRF }        from '@/lib/csrf';

export const runtime = 'nodejs';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const refreshToken = req.cookies.get('__refresh')?.value;
    if (refreshToken) {
      try {
        const payload   = await verifyRefreshToken(refreshToken);
        const sessionId = await getSessionIdFromFamily(payload.family);
        await revokeRefreshFamily(payload.family, 'logout');
        if (sessionId) {
          const { userId } = await requireAuth(req);
          if (userId) await revokeSession(sessionId, userId);
        }
      } catch {
        // Token already expired — that's fine
      }
    }

    const { userId } = await requireAuth(req);
    if (userId) {
      logAuthEvent('logout', userId);
      await Analytics.logout(userId);
    }

    const expiredOpts = [
      'Path=/', 'HttpOnly', 'SameSite=Strict',
      IS_PROD ? 'Secure' : '',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ].filter(Boolean).join('; ');

    const res = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200, headers: SECURITY_HEADERS }
    );
    res.headers.append('Set-Cookie', `__access=; ${expiredOpts}`);
    res.headers.append(
      'Set-Cookie',
      `__refresh=; Path=/api/auth/session; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${IS_PROD ? '; Secure' : ''}`
    );
    return res;

  } catch (err) {
    await captureException(err, { route: '/api/auth/logout', requestId });
    logger.error({ requestId, err }, 'logout error');
    const res = NextResponse.json({ message: 'Logged out' }, { status: 200, headers: SECURITY_HEADERS });
    res.headers.append('Set-Cookie', '__access=; Path=/; Max-Age=0');
    res.headers.append('Set-Cookie', '__refresh=; Path=/api/auth/session; Max-Age=0');
    return res;
  }
}
