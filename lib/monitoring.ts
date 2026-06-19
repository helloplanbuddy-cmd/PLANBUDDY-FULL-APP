// ============================================================
// lib/monitoring.ts — Sentry setup and error reporting helpers
// ============================================================

// ── Sentry (server-side) ───────────────────────────────────
// Full Sentry setup requires sentry.server.config.ts / sentry.client.config.ts
// This file provides lightweight wrappers that degrade gracefully when
// SENTRY_DSN is not configured.

let _sentryServer: typeof import('@sentry/nextjs') | null = null;

async function getSentry() {
  if (_sentryServer) return _sentryServer;
  try {
    _sentryServer = await import('@sentry/nextjs');
    return _sentryServer;
  } catch {
    return null;
  }
}

export async function captureException(err: unknown, context?: Record<string, unknown>) {
  try {
    const sentry = await getSentry();
    if (!sentry) return;
    sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      sentry.captureException(err);
    });
  } catch {
    // Never throw from monitoring code
    console.error('[Monitoring] captureException failed:', err);
  }
}

export async function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  try {
    const sentry = await getSentry();
    if (!sentry) return;
    sentry.captureMessage(message, level);
  } catch {
    // noop
  }
}

/** Wrap an API handler and auto-capture any unhandled errors */
export function withMonitoring<T>(
  handler: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  return handler().catch(async (err) => {
    await captureException(err, context);
    throw err;
  });
}
