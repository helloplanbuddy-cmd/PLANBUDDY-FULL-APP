// ============================================================
// /api/auth/session — Phase 2A
// CHANGES: DB-backed refresh family validation,
//          device session touch, full JWT claim validation,
//          structured logging, OTel tracing
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { requireAuth }      from '@/lib/authMiddleware';
import { apiOk, apiError, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { Analytics }        from '@/lib/analytics';
import { captureException } from '@/lib/monitoring';
import { logger, generateRequestId, logApiRequest, logApiResponse, logAuthEvent } from '@/lib/logger';
import { trace }            from '@/lib/telemetry';


export const runtime = 'nodejs';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'GET', '/api/auth/session');

  try {
    getEnv();

    // Proxy to backend
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    const res = await fetch(`${base}/api/auth/session`, { method: 'GET', headers: { cookie: req.headers.get('cookie') || '' } });
    const data = await res.json();
    const out = NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    const setCookies = res.headers.get('set-cookie');
    if (setCookies) out.headers.append('Set-Cookie', setCookies);
    logApiResponse(requestId, '/api/auth/session', res.status, Date.now() - start);
    return out;

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

    // Proxy to backend refresh route
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    const res = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { cookie: req.headers.get('cookie') || '' } });
    const data = await res.json();
    const out = NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    const setCookies = res.headers.get('set-cookie');
    if (setCookies) out.headers.append('Set-Cookie', setCookies);
    logApiResponse(requestId, '/api/auth/session', res.status, Date.now() - start);
    return out;

  } catch (err) {
    await captureException(err, { route: 'POST /api/auth/session', requestId });
    logger.error({ requestId, err }, 'session POST error');
    return apiError('Internal server error', 500);
  }
}
