// ============================================================
// lib/authMiddleware.ts — API route auth guard
// Usage:
//   const { userId, error } = await requireAuth(req);
//   if (error) return error;
// ============================================================

import { type NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from './jwt';

export interface AuthContext {
  userId: string;
  phone: string;
}

type AuthResult =
  | { userId: string; phone: string; error: null }
  | { userId: null; phone: null; error: NextResponse };

/**
 * Extracts Bearer token from Authorization header or __access cookie.
 * Returns userId on success, or a 401/403 NextResponse on failure.
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  let token: string | undefined;

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // 2. Fallback: __access cookie
  if (!token) {
    token = req.cookies.get('__access')?.value;
  }

  if (!token) {
    return {
      userId: null,
      phone: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  try {
    const payload = await verifyAccessToken(token);
    return { userId: payload.sub!, phone: payload.phone, error: null };
  } catch {
    return {
      userId: null,
      phone: null,
      error: NextResponse.json({ error: 'Token expired or invalid' }, { status: 401 }),
    };
  }
}
