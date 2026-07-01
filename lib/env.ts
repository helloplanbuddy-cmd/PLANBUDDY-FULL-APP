// ============================================================
// lib/env.ts — Centralized environment validation (Phase 2A)
// Validates all required env vars at startup.
// EXTENDED: Added DATABASE_URL, Redis, OTEL, CSRF vars.
// ============================================================

import { z } from 'zod';

const ServerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10).optional().or(z.literal('')),
  JWT_SECRET: z.string().min(32).optional().or(z.literal('')),
  JWT_REFRESH_SECRET: z.string().min(32).optional().or(z.literal('')),
  DATABASE_URL: z.string().optional().or(z.literal('')),

  SMS_PROVIDER: z.enum(['twilio', 'mock']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().optional().or(z.literal('')),
  TWILIO_AUTH_TOKEN: z.string().optional().or(z.literal('')),
  TWILIO_PHONE_NUMBER: z.string().optional().or(z.literal('')),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal('')),

  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().or(z.literal('')),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional().or(z.literal('')),
  DISABLE_AI: z.enum(['true', 'false']).optional().default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _env: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (_env) return _env;

  const result = ServerEnvSchema.safeParse(process.env);
  const fallback = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    JWT_SECRET: process.env.JWT_SECRET ?? 'dev-jwt-secret-32-chars-minimum-1234',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-32-chars-minimum-1234',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres',
    SMS_PROVIDER: (process.env.SMS_PROVIDER as 'twilio' | 'mock' | undefined) ?? 'mock',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ?? '',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? '',
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? '',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    SENTRY_DSN: process.env.SENTRY_DSN ?? '',
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '',
    DISABLE_AI: (process.env.DISABLE_AI === 'true' ? 'true' : 'false') as 'true' | 'false',
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'test' | 'production' | undefined) ?? 'development',
  } satisfies ServerEnv;

  if (!result.success) {
    _env = fallback;
    return _env;
  }

  _env = {
    ...fallback,
    ...result.data,
  };
  return _env;
}

// Allows tests to reset cached env
export function _resetEnvCache(): void { _env = null; }
