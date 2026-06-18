// ============================================================
// /api/user/profile — User profile endpoint
// GET  /api/user/profile  — get current user profile
// PATCH /api/user/profile — update profile
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
  logApiRequest(requestId, 'GET', '/api/user/profile');

  try {
    const { userId, phone, error } = await requireAuth(req);
    if (error) return error;

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (base) {
      const res = await fetch(`${base}/api/user/profile`, {
        headers: { cookie: req.headers.get('cookie') || '', authorization: req.headers.get('authorization') || '' },
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    }

    logApiResponse(requestId, '/api/user/profile', 200, Date.now() - start);
    return apiOk({ id: userId, phone, name: '', homeCity: 'Mumbai', travelStyle: ['mid'], interests: [], tripsCompleted: 0, travelerTitle: 'Explorer' });
  } catch (err) {
    await captureException(err, { route: '/api/user/profile', requestId });
    logger.error({ requestId, err }, 'profile GET error');
    return apiError('Internal server error', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  logApiRequest(requestId, 'PATCH', '/api/user/profile');

  try {
    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const body = await req.json();

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
    if (base) {
      const res = await fetch(`${base}/api/user/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status, headers: SECURITY_HEADERS });
    }

    logApiResponse(requestId, '/api/user/profile', 200, Date.now() - start);
    return apiOk({ message: 'Profile updated (offline)' });
  } catch (err) {
    await captureException(err, { route: 'PATCH /api/user/profile', requestId });
    logger.error({ requestId, err }, 'profile PATCH error');
    return apiError('Internal server error', 500);
  }
}
