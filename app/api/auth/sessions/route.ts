// ============================================================
// /api/auth/sessions — Device session management (Phase 2A)
// GET  /api/auth/sessions        — list active sessions
// DELETE /api/auth/sessions      — revoke all sessions (global logout)
// DELETE /api/auth/sessions/:id  — revoke specific session
// ============================================================

import { type NextRequest } from 'next/server';
import { requireAuth }            from '@/lib/authMiddleware';
import { listUserSessions, revokeSession, revokeAllUserSessions } from '@/lib/dbSessionStore';
import { apiOk, apiError }        from '@/lib/apiHelpers';
import { captureException }       from '@/lib/monitoring';
import { logger, generateRequestId, logAuthEvent } from '@/lib/logger';
import { validateCSRF }           from '@/lib/csrf';

export const runtime = 'nodejs';

/** GET — list all active sessions */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  try {
    const { userId, error } = await requireAuth(req);
    if (error) return error;

    const sessions = await listUserSessions(userId);
    return apiOk({ sessions });
  } catch (err) {
    await captureException(err, { route: 'GET /api/auth/sessions', requestId });
    return apiError('Internal server error', 500);
  }
}

/** DELETE — revoke all sessions for this user */
export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId();
  try {
    const csrfError = validateCSRF(req);
    if (csrfError) return csrfError;

    const { userId, error } = await requireAuth(req);
    if (error) return error;

    // Check for specific sessionId in body
    const body = await req.json().catch(() => ({})) as { sessionId?: string };

    if (body.sessionId) {
      await revokeSession(body.sessionId, userId);
      logAuthEvent('session_revoked', userId, { sessionId: body.sessionId });
      return apiOk({ message: 'Session revoked' });
    }

    await revokeAllUserSessions(userId);
    logAuthEvent('all_sessions_revoked', userId);
    logger.info({ userId, requestId }, 'All sessions revoked');
    return apiOk({ message: 'All sessions revoked' });

  } catch (err) {
    await captureException(err, { route: 'DELETE /api/auth/sessions', requestId });
    return apiError('Internal server error', 500);
  }
}
