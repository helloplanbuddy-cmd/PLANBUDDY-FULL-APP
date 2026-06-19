// ============================================================
// lib/logger.ts — Pino structured logging
// Phase 2A: Structured JSON logs — never console.log in production
//
// Log shape (every entry includes):
//   timestamp, level, requestId, userId?, route?, message, ...fields
// ============================================================

import pino from 'pino';

const isDev  = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// ── Root logger ───────────────────────────────────────────

export const logger = pino({
  name:  'planbuddy',
  level: isTest ? 'silent' : isDev ? 'debug' : 'info',

  // Pretty-print in development, raw JSON in production
  ...(isDev && {
    transport: {
      target:  'pino-pretty',
      options: {
        colorize:        true,
        translateTime:   'HH:MM:ss',
        ignore:          'pid,hostname',
        messageFormat:   '{msg} {requestId}',
      },
    },
  }),

  // Redact sensitive fields from logs
  redact: {
    paths:  ['phone', '*.phone', 'otp', '*.otp', 'token', '*.token',
             'password', '*.password', 'authorization', '*.authorization',
             'cookie', '*.cookie', 'refreshToken', '*.refreshToken',
             'ipAddress', '*.ipAddress'],
    censor: '[REDACTED]',
  },

  // Base fields on every log entry
  base: {
    env: process.env.NODE_ENV,
    version: '5.0.0',
  },

  // ISO timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ── Request-scoped child logger factory ───────────────────

export interface RequestContext {
  requestId: string;
  userId?:   string;
  route?:    string;
  method?:   string;
}

export function requestLogger(ctx: RequestContext) {
  return logger.child(ctx);
}

// ── Correlation ID generator ──────────────────────────────

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Standard log helpers ──────────────────────────────────

export function logApiRequest(
  requestId: string,
  method:    string,
  route:     string,
  userId?:   string
): void {
  logger.info({ requestId, method, route, userId }, `→ ${method} ${route}`);
}

export function logApiResponse(
  requestId: string,
  route:     string,
  status:    number,
  latencyMs: number,
  userId?:   string
): void {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  logger[level]({ requestId, route, status, latencyMs, userId }, `← ${status} ${route} (${latencyMs}ms)`);
}

export function logAuthEvent(
  event:     string,
  userId?:   string,
  meta?:     Record<string, unknown>
): void {
  logger.info({ event, userId, ...meta }, `[auth] ${event}`);
}

export function logSecurityEvent(
  event:     string,
  severity:  'low' | 'medium' | 'high' | 'critical',
  meta?:     Record<string, unknown>
): void {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  logger[level]({ event, severity, ...meta }, `[security] ${event}`);
}

export function logSyncEvent(
  event:    string,
  jobId?:   string,
  userId?:  string,
  meta?:    Record<string, unknown>
): void {
  logger.info({ event, jobId, userId, ...meta }, `[sync] ${event}`);
}
