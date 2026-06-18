// ============================================================
// /api/trips — Trip CRUD API endpoint
// GET  /api/trips        — list all trips for user
// POST /api/trips        — create a new trip (proxied to backend)
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/authMiddleware';
import { logger, generateRequestId, logApiRequest, logApiResponse } from '@/lib/logger';
import { apiOk, apiError, SECURITY_HEADERS } from '@/lib/apiHelpers';
import { captureException } from '@/lib/monitoring';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'GET', '/api/trips');

  try {
    const { userId, error } = await requireAuth(req);
    if (error) return error;

    // Proxy to backend if configured
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (base) {
      const res = await fetch(`${base}/api/trips`, {
        headers: { cookie: req.headers.get('cookie') || '', authorization: req.headers.get('authorization') || '' },
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    }

    // Stub: return empty list when no backend — client uses Zustand store
    logApiResponse(requestId, '/api/trips', 200, Date.now() - start);
    return apiOk({ trips: [] });
  } catch (err) {
    await captureException(err, { route: '/api/trips', requestId });
    logger.error({ requestId, err }, 'trips list error');
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'POST', '/api/trips');

  try {
    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (base) {
      const body = await req.json();
      const res = await fetch(`${base}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    }

    logApiResponse(requestId, '/api/trips', 201, Date.now() - start);
    return apiOk({ message: 'Trip created (offline)', id: `trip_${Date.now()}` }, 201);
  } catch (err) {
    await captureException(err, { route: 'POST /api/trips', requestId });
    logger.error({ requestId, err }, 'trips create error');
    return apiError('Internal server error', 500);
  }
}
