// ============================================================
// middleware.ts — Next.js edge middleware
// - Protects /dashboard/* routes (requires valid access token)
// - Auto-redirects unauthenticated users to /auth/phone
// - Adds security headers to all responses
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// Protected route patterns
const PROTECTED   = ['/dashboard'];
const AUTH_ROUTES = ['/auth/phone', '/auth/otp'];
// Explicitly public — never redirected regardless of auth state
const PUBLIC      = ['/demo-trip-generator', '/onboarding', '/splash', '/'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname.startsWith(p));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((p) => pathname.startsWith(p));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes (they self-authenticate), static assets, etc.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/public/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const accessToken  = req.cookies.get('__access')?.value;
  const refreshToken = req.cookies.get('__refresh')?.value;

  // ── Explicitly public routes — always pass through ────────
  // /demo-trip-generator and /onboarding are accessible without auth.
  // Authenticated users can still visit them (back navigation must work).
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // ── Protected route: check token ─────────────────────────
  if (isProtected(pathname)) {
    if (!accessToken && !refreshToken) {
      // No tokens at all — redirect to login
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/auth/phone';
      return NextResponse.redirect(loginUrl);
    }

    if (!accessToken && refreshToken) {
      // Access expired but refresh exists — attempt silent refresh
      // The client-side useAuth hook will handle this via /api/auth/session POST
      // At the edge we just let the request through and let client refresh
      return NextResponse.next();
    }

    return NextResponse.next();
  }

  // ── Auth routes: redirect if already logged in ────────────
  if (isAuthRoute(pathname) && accessToken) {
    const dashUrl = req.nextUrl.clone();
    dashUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
