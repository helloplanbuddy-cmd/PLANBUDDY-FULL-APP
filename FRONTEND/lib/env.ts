// ============================================================
// lib/env.ts — Centralized environment validation (Phase 2A)
// Validates all required env vars at startup.
// EXTENDED: Added DATABASE_URL, Redis, OTEL, CSRF vars.
// ============================================================

import { z } from 'zod';

const ServerEnvSchema = z.object({
  // ── Required ────────────────────────────────────────────
  ANTHROPIC_API_KEY:   z.string().min(10,  'ANTHROPIC_API_KEY is required'),
  JWT_SECRET:          z.string().min(32,  'JWT_SECRET must be ≥32 chars'),
  JWT_REFRESH_SECRET:  z.string().min(32,  'JWT_REFRESH_SECRET must be ≥32 chars'),
  DATABASE_URL:        z.string().url().refine(
    (u) => u.startsWith('postgresql://') || u.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection string'
  ),

  // ── SMS ─────────────────────────────────────────────────
  SMS_PROVIDER:        z.enum(['twilio', 'mock']).default('mock'),
  TWILIO_ACCOUNT_SID:  z.string().optional(),
  TWILIO_AUTH_TOKEN:   z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // ── Redis (optional — falls back to in-memory) ──────────
  UPSTASH_REDIS_REST_URL:   z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ── Observability ────────────────────────────────────────
  SENTRY_DSN:               z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_POSTHOG_KEY:  z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  // ── App ─────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS:     z.string().optional(),
  DISABLE_AI:          z.enum(['true', 'false']).optional().default('false'),
  NODE_ENV:            z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _env: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (_env) return _env;

  const result = ServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `[PlanBuddy] Missing/invalid environment variables:\n${missing}\n\nCheck your .env.local file.`
    );
  }

  if (result.data.SMS_PROVIDER === 'twilio') {
    const missing: string[] = [];
    if (!result.data.TWILIO_ACCOUNT_SID)  missing.push('TWILIO_ACCOUNT_SID');
    if (!result.data.TWILIO_AUTH_TOKEN)   missing.push('TWILIO_AUTH_TOKEN');
    if (!result.data.TWILIO_PHONE_NUMBER) missing.push('TWILIO_PHONE_NUMBER');
    if (missing.length) {
      throw new Error(`[PlanBuddy] SMS_PROVIDER=twilio but missing: ${missing.join(', ')}`);
    }
  }

  _env = result.data;
  return _env;
}

// Allows tests to reset cached env
export function _resetEnvCache(): void { _env = null; }
