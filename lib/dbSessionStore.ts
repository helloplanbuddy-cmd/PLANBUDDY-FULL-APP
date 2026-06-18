// ============================================================
// lib/dbSessionStore.ts — PostgreSQL-backed session management
// Phase 2A: Replaces all in-memory Map() stores in sessionStore.ts
//
// Covers:
//   - OTP storage (SHA-256 hashed, never plaintext)
//   - User get-or-create
//   - Refresh token families with rotation
//   - Device session management
// ============================================================

import { db } from './db';
import { createHash, randomBytes } from 'crypto';
import { logger } from './logger';

// ── Constants ─────────────────────────────────────────────

const OTP_TTL_MS      = 5 * 60 * 1000;   // 5 minutes
const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL_DAYS = 7;

// ── Helpers ───────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function nowPlusDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

// ── Types ─────────────────────────────────────────────────

export interface OTPVerifyResult {
  valid: boolean;
  expired: boolean;
  locked: boolean;
  attemptsLeft: number;
}

export interface UserRecord {
  id: string;
  phone: string;
  createdAt: number;
  lastLoginAt: number;
}

export interface DeviceSessionInfo {
  deviceId:   string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress:  string | null;
  userAgent:  string | null;
}

// ── OTP Store (SHA-256 hashed) ─────────────────────────────

/**
 * Store a new OTP for a phone number.
 * OTP is hashed with SHA-256 before storage — never stored in plaintext.
 */
export async function storeOTP(
  phone:    string,
  otp:      string,
  options?: { ipAddress?: string; deviceId?: string }
): Promise<void> {
  const otpHash  = sha256(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate any previous active OTPs for this phone
  await db.otpCode.updateMany({
    where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
    data:  { expiresAt: new Date() }, // expire immediately
  });

  await db.otpCode.create({
    data: {
      phone,
      otpHash,
      expiresAt,
      ipAddress: options?.ipAddress,
      deviceId:  options?.deviceId,
    },
  });

  logger.info({ phone: phone.slice(0, 4) + '****', action: 'otp_stored' }, 'OTP stored');
}

/**
 * Verify an OTP against the stored hash.
 * Never compares plaintext; always compares SHA-256 hashes.
 */
export async function verifyOTPHash(
  phone: string,
  otp:   string
): Promise<OTPVerifyResult> {
  const otpHash = sha256(otp);

  // Find the most recent active OTP for this phone
  const record = await db.otpCode.findFirst({
    where:   { phone, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { valid: false, expired: true, locked: false, attemptsLeft: 0 };
  }

  if (record.expiresAt < new Date()) {
    return { valid: false, expired: true, locked: false, attemptsLeft: 0 };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, expired: false, locked: true, attemptsLeft: 0 };
  }

  if (record.otpHash !== otpHash) {
    // Increment attempt counter
    await db.otpCode.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });
    const attemptsLeft = MAX_OTP_ATTEMPTS - (record.attempts + 1);
    return {
      valid:        false,
      expired:      false,
      locked:       attemptsLeft <= 0,
      attemptsLeft: Math.max(0, attemptsLeft),
    };
  }

  // Valid — mark as used
  await db.otpCode.update({
    where: { id: record.id },
    data:  { usedAt: new Date() },
  });

  return { valid: true, expired: false, locked: false, attemptsLeft: MAX_OTP_ATTEMPTS };
}

// ── User Management ────────────────────────────────────────

/**
 * Get or create a user by phone number.
 * Idempotent — safe to call multiple times.
 */
export async function getOrCreateUser(phone: string): Promise<UserRecord> {
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) {
    return {
      id:          existing.id,
      phone:       existing.phone,
      createdAt:   existing.createdAt.getTime(),
      lastLoginAt: Date.now(),
    };
  }

  const created = await db.user.create({
    data: { phone },
  });
  logger.info({ userId: created.id }, 'New user created');
  return {
    id:          created.id,
    phone:       created.phone,
    createdAt:   created.createdAt.getTime(),
    lastLoginAt: Date.now(),
  };
}

/**
 * Get user by ID.
 */
export async function getUserById(id: string): Promise<UserRecord | null> {
  const user = await db.user.findUnique({
    where: { id, deletedAt: null },
  });
  if (!user) return null;
  return {
    id:          user.id,
    phone:       user.phone,
    createdAt:   user.createdAt.getTime(),
    lastLoginAt: Date.now(),
  };
}

// ── Device Session Management ──────────────────────────────

/**
 * Create a new device session on login.
 */
export async function createDeviceSession(
  userId:  string,
  device:  DeviceSessionInfo
): Promise<string> {
  const session = await db.userSession.create({
    data: {
      userId,
      deviceId:   device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      ipAddress:  device.ipAddress,
      userAgent:  device.userAgent,
      expiresAt:  nowPlusDays(SESSION_TTL_DAYS),
      lastSeenAt: new Date(),
    },
  });
  return session.id;
}

/**
 * Touch session last_seen_at.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data:  { lastSeenAt: new Date() },
  }).catch(() => { /* non-critical */ });
}

/**
 * List all active sessions for a user.
 */
export async function listUserSessions(userId: string) {
  return db.userSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true, deviceId: true, deviceName: true, deviceType: true,
      lastSeenAt: true, createdAt: true, ipAddress: true,
    },
  });
}

/**
 * Revoke a single session.
 */
export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { id: sessionId, userId },
    data:  { revokedAt: new Date() },
  });
  // Also revoke all refresh tokens for this session
  await db.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: 'session_revoked' },
  });
}

/**
 * Revoke ALL sessions for a user (global logout).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.userSession.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: 'all_sessions_revoked' },
  });
}

// ── Refresh Token Family ───────────────────────────────────

/**
 * Generate a unique token family ID.
 */
export function generateFamily(): string {
  return `fam_${randomBytes(16).toString('hex')}`;
}

/**
 * Generate a unique device ID.
 */
export function generateDeviceId(): string {
  return `dev_${randomBytes(16).toString('hex')}`;
}

/**
 * Store a new refresh token family (on login).
 */
export async function storeRefreshFamily(
  family:    string,
  userId:    string,
  tokenHash: string,
  sessionId: string
): Promise<void> {
  await db.refreshToken.create({
    data: {
      userId,
      sessionId,
      family,
      tokenHash,
      expiresAt: nowPlusDays(SESSION_TTL_DAYS),
    },
  });
}

/**
 * Validate a refresh token family hash.
 * Returns false if revoked, expired, or hash mismatch.
 */
export async function validateRefreshFamily(
  family:    string,
  tokenHash: string
): Promise<boolean> {
  const record = await db.refreshToken.findUnique({ where: { family } });
  if (!record) return false;
  if (record.revokedAt) return false;
  if (record.expiresAt < new Date()) return false;
  return record.tokenHash === tokenHash;
}

/**
 * Rotate a refresh token family to a new hash.
 */
export async function rotateRefreshFamily(
  family:       string,
  newTokenHash: string
): Promise<void> {
  await db.refreshToken.update({
    where: { family },
    data:  { tokenHash: newTokenHash, rotatedAt: new Date() },
  });
}

/**
 * Revoke an entire refresh token family (replay attack detected).
 */
export async function revokeRefreshFamily(
  family: string,
  reason  = 'revoked'
): Promise<void> {
  await db.refreshToken.updateMany({
    where: { family },
    data:  { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Get session ID from a refresh token family.
 */
export async function getSessionIdFromFamily(family: string): Promise<string | null> {
  const record = await db.refreshToken.findUnique({
    where: { family },
    select: { sessionId: true },
  });
  return record?.sessionId ?? null;
}
