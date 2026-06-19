// ============================================================
// lib/apiHelpers.ts — Standard API response utilities
// ============================================================

import { NextResponse } from 'next/server';

/** Security headers applied to every API response */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options':            'nosniff',
  'X-Frame-Options':                   'DENY',
  'Referrer-Policy':                   'strict-origin-when-cross-origin',
  'Cache-Control':                     'no-store',
  'Strict-Transport-Security':         'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.posthog.com; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
    "connect-src 'self' https://api.anthropic.com https://app.posthog.com https://ingest.sentry.io; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-XSS-Protection': '1; mode=block',
};

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: SECURITY_HEADERS });
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: SECURITY_HEADERS });
}

export function apiRateLimited(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', resetAt },
    {
      status: 429,
      headers: {
        ...SECURITY_HEADERS,
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    }
  );
}

/** Validate request Content-Type and body size */
export async function safeParseBody(
  req: Request,
  maxBytes = 50_000
): Promise<{ body: unknown; error: string | null }> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { body: null, error: 'Content-Type must be application/json' };
  }
  const text = await req.text();
  if (text.length > maxBytes) {
    return { body: null, error: 'Request payload too large' };
  }
  try {
    return { body: JSON.parse(text), error: null };
  } catch {
    return { body: null, error: 'Invalid JSON' };
  }
}
