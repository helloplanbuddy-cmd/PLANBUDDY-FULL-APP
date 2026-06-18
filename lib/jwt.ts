// ============================================================
// lib/jwt.ts — JWT token helpers (Phase 2A)
// EXTENDED: Added audience, issuer, and JTI validation.
// All tokens now include iss, aud, jti claims.
// ============================================================

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getEnv } from './env';
import { randomBytes } from 'crypto';

// ── Constants ─────────────────────────────────────────────

const ISSUER      = 'planbuddy-api';
const AUDIENCE    = 'planbuddy-app';

export interface AccessTokenPayload extends JWTPayload {
  sub:      string;   // userId
  phone:    string;
  type:     'access';
  jti:      string;   // JWT ID — unique per token
  deviceId?: string;
}

export interface RefreshTokenPayload extends JWTPayload {
  sub:    string;
  type:   'refresh';
  family: string;
  jti:    string;
}

function enc(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function newJTI(): string {
  return randomBytes(16).toString('hex');
}

// ── Access token (15 minutes) ──────────────────────────────

export async function signAccessToken(
  userId:   string,
  phone:    string,
  deviceId?: string
): Promise<string> {
  const { JWT_SECRET } = getEnv();
  return new SignJWT({
    sub: userId, phone, type: 'access', jti: newJTI(), deviceId,
  } as AccessTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(enc(JWT_SECRET));
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { JWT_SECRET } = getEnv();
  const { payload } = await jwtVerify(token, enc(JWT_SECRET), {
    issuer:   ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if ((payload as AccessTokenPayload).type !== 'access') {
    throw new Error('Invalid token type');
  }
  return payload as AccessTokenPayload;
}

// ── Refresh token (7 days) ────────────────────────────────

export async function signRefreshToken(
  userId: string,
  family: string
): Promise<string> {
  const { JWT_REFRESH_SECRET } = getEnv();
  return new SignJWT({
    sub: userId, type: 'refresh', family, jti: newJTI(),
  } as RefreshTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(enc(JWT_REFRESH_SECRET));
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { JWT_REFRESH_SECRET } = getEnv();
  const { payload } = await jwtVerify(token, enc(JWT_REFRESH_SECRET), {
    issuer:   ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if ((payload as RefreshTokenPayload).type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return payload as RefreshTokenPayload;
}
