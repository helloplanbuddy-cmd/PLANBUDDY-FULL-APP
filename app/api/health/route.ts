// /api/health — Production health check endpoint
// Used by CI/CD post-deploy verification and monitoring

import { type NextRequest } from 'next/server';
import { apiOk, apiError } from '@/lib/apiHelpers';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const start = Date.now();

  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // ── DB check ────────────────────────────────────────────
  try {
    const dbStart = Date.now();
    const { db }  = await import('@/lib/db');
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, error: 'DB unreachable' };
    logger.error({ err }, '[health] DB check failed');
  }

  // ── Env check ────────────────────────────────────────────
  try {
    const { getEnv } = await import('@/lib/env');
    getEnv();
    checks.env = { ok: true };
  } catch (err) {
    checks.env = { ok: false, error: (err as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  if (!allOk) {
    return apiError('Service unhealthy', 503);
  }

  return apiOk({
    status:  'ok',
    version: '5.0.0',
    uptime:  process.uptime(),
    latencyMs: Date.now() - start,
    checks,
    timestamp: new Date().toISOString(),
  });
}
