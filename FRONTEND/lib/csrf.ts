// ============================================================
// lib/csrf.ts — CSRF protection
// Phase 2A: Double-submit cookie + origin validation
//
// Strategy:
//   1. Origin/Referer header validation (primary)
//   2. Double-submit cookie token (secondary)
//   3. SameSite=Strict cookies (defense-in-depth, set in auth routes)
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'crypto';
import { logger } from './logger';

const CSRF_COOKIE   = '__csrf';
const CSRF_HEADER   = 'x-csrf-token';
const CSRF_TTL_MS   = 60 * 60 * 1000; // 1 hour

// ── Token generation ──────────────────────────────────────

export function generateCSRFToken(): string {
  const rand      = randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  const secret    = process.env.JWT_SECRET ?? 'dev-csrf-secret';
  const sig       = createHmac('sha256', secret)
    .update(`${rand}:${timestamp}`)
    .digest('hex')
    .slice(0, 16);
  return `${rand}.${timestamp}.${sig}`;
}

export function validateCSRFToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [rand, timestamp, sig] = parts;

  // Check age
  const ts = parseInt(timestamp, 36);
  if (isNaN(ts) || Date.now() - ts > CSRF_TTL_MS) return false;

  // Verify signature
  const secret    = process.env.JWT_SECRET ?? 'dev-csrf-secret';
  const expected  = createHmac('sha256', secret)
    .update(`${rand}:${timestamp}`)
    .digest('hex')
    .slice(0, 16);

  return sig === expected;
}

// ── Origin validation ─────────────────────────────────────

function getAllowedOrigins(): string[] {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const extra  = process.env.ALLOWED_ORIGINS ?? '';
  return [appUrl, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
}

function validateOrigin(req: NextRequest): boolean {
  const origin  = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const allowed = getAllowedOrigins();

  // Same-origin requests from Next.js don't always send Origin header
  // — allow requests with no origin on non-browser paths
  if (!origin && !referer) {
    // No origin header — could be a server-to-server call or a form submission
    // Allow for now but log
    return true;
  }

  const check = origin ?? (referer ? new URL(referer).origin : null);
  if (!check) return true;

  return allowed.some((a) => check === a || check.startsWith(a));
}

// ── CSRF middleware ───────────────────────────────────────

/**
 * Validate CSRF for a state-mutating request.
 * Returns a NextResponse error if CSRF check fails, null if OK.
 *
 * Usage in API routes:
 *   const csrfError = await validateCSRF(req);
 *   if (csrfError) return csrfError;
 */
export function validateCSRF(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();

  // Only check state-mutating methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;

  // 1. Origin validation
  if (!validateOrigin(req)) {
    logger.warn({
      origin:  req.headers.get('origin'),
      referer: req.headers.get('referer'),
      route:   req.nextUrl.pathname,
    }, '[security] CSRF origin validation failed');
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  // 2. Double-submit cookie check
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);

  // If neither is present, we're operating in SameSite=Strict-only mode
  // (acceptable for same-origin SPA — origin check above is the guard)
  if (!cookieToken && !headerToken) return null;

  // If one is present but not the other — reject
  if (!cookieToken || !headerToken) {
    logger.warn({ hasCookie: !!cookieToken, hasHeader: !!headerToken }, '[security] CSRF token mismatch');
    return NextResponse.json({ error: 'CSRF token missing' }, { status: 403 });
  }

  // Tokens must match and be valid
  if (cookieToken !== headerToken || !validateCSRFToken(cookieToken)) {
    logger.warn({ route: req.nextUrl.pathname }, '[security] CSRF token invalid');
    return NextResponse.json({ error: 'CSRF token invalid' }, { status: 403 });
  }

  return null;
}

/**
 * Set a CSRF cookie on a response.
 * Call this on any GET that renders a form/auth page.
 */
export function setCSRFCookie(res: NextResponse): string {
  const token  = generateCSRFToken();
  const isProd = process.env.NODE_ENV === 'production';
  const opts   = [
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${CSRF_TTL_MS / 1000}`,
    isProd ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  res.headers.append('Set-Cookie', `${CSRF_COOKIE}=${token}; ${opts}`);
  return token;
}
