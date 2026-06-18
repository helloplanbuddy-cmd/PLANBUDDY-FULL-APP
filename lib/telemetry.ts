// ============================================================
// lib/telemetry.ts — OpenTelemetry observability
// Phase 2A: Traces API calls, DB queries, AI calls end-to-end
//
// Gracefully no-ops if OTEL_EXPORTER_OTLP_ENDPOINT not configured.
// ============================================================

import { logger } from './logger';

// ── Types ─────────────────────────────────────────────────

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(code: SpanStatusCode, message?: string): void;
  recordException(error: Error | unknown): void;
  end(): void;
}

export enum SpanStatusCode {
  UNSET = 0,
  OK    = 1,
  ERROR = 2,
}

// ── Lazy OTel loader ──────────────────────────────────────

let _tracer: {
  startSpan(name: string, options?: { attributes?: Record<string, string | number> }): Span;
} | null = null;

let _otelReady = false;

async function getTracer() {
  if (_otelReady) return _tracer;
  _otelReady = true;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    logger.debug('OTEL not configured — telemetry disabled');
    return null;
  }

  try {
    // Use NodeSDK (high-level API) so it resolves internal OTel package
    // version conflicts itself. We cast through unknown only at the
    // constructor boundary where duplicate sdk-trace-base types collide.
    const { NodeSDK, api }             = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter }        = await import('@opentelemetry/exporter-trace-otlp-http');

    const sdkInstance = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) as unknown as import('@opentelemetry/sdk-trace-base').SpanExporter,
      serviceName: 'planbuddy',
    });

    sdkInstance.start();

    _tracer = api.trace.getTracer('planbuddy', '5.0.0') as unknown as typeof _tracer;
    logger.info({ endpoint }, 'OpenTelemetry initialized');
    return _tracer;
  } catch (err) {
    logger.warn({ err }, 'OpenTelemetry init failed — telemetry disabled');
    return null;
  }
}

// ── No-op span (when OTel not available) ──────────────────

const noopSpan: Span = {
  setAttribute:    () => {},
  setStatus:       () => {},
  recordException: () => {},
  end:             () => {},
};

// ── Public API ────────────────────────────────────────────

/**
 * Start a telemetry span. Always returns a Span (noop if OTel unavailable).
 */
export async function startSpan(
  name:       string,
  attributes?: Record<string, string | number>
): Promise<Span> {
  try {
    const tracer = await getTracer();
    if (!tracer) return noopSpan;
    return tracer.startSpan(name, { attributes });
  } catch {
    return noopSpan;
  }
}

/**
 * Wrap an async operation in a span. Auto-records errors and latency.
 */
export async function traced<T>(
  name:       string,
  operation:  () => Promise<T>,
  attributes?: Record<string, string | number>
): Promise<T> {
  const span = await startSpan(name, attributes);
  const start = Date.now();

  try {
    const result = await operation();
    span.setAttribute('latency_ms', Date.now() - start);
    span.setStatus(SpanStatusCode.OK);
    return result;
  } catch (err) {
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : 'error');
    span.setAttribute('latency_ms', Date.now() - start);
    throw err;
  } finally {
    span.end();
  }
}

// ── Pre-named span helpers ─────────────────────────────────

export const trace = {
  /** Wrap a DB query */
  db: <T>(operation: string, fn: () => Promise<T>) =>
    traced(`db.${operation}`, fn, { 'db.operation': operation }),

  /** Wrap an AI call */
  ai: <T>(endpoint: string, model: string, fn: () => Promise<T>) =>
    traced(`ai.${endpoint}`, fn, { 'ai.endpoint': endpoint, 'ai.model': model }),

  /** Wrap an auth operation */
  auth: <T>(operation: string, fn: () => Promise<T>) =>
    traced(`auth.${operation}`, fn, { 'auth.operation': operation }),

  /** Wrap a sync operation */
  sync: <T>(operation: string, fn: () => Promise<T>) =>
    traced(`sync.${operation}`, fn, { 'sync.operation': operation }),

  /** Wrap an API handler */
  api: <T>(route: string, method: string, fn: () => Promise<T>) =>
    traced(`api.${method}.${route}`, fn, { 'http.route': route, 'http.method': method }),
};
