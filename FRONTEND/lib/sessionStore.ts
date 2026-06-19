// ============================================================
// lib/sessionStore.ts — DEPRECATED (Phase 2A)
// ============================================================
// STATUS: DEPRECATED — Do not use in new code.
// REPLACEMENT: lib/dbSessionStore.ts (PostgreSQL-backed)
// MIGRATION: All callers migrated to dbSessionStore in Phase 2A.
// REMOVAL: Safe to remove after confirming 0 imports remain and
//          dbSessionStore has been in production for ≥30 days.
//
// This file is retained to satisfy File Preservation Policy:
//   - File has not been fully analyzed for all indirect references
//   - Backward-compatibility shim may be needed during deployment
//   - Replacement (dbSessionStore.ts) must be confirmed stable first
//
// KEPT AS-IS — no functionality removed.
// ============================================================

// ── OTP Store ─────────────────────────────────────────────

interface OTPRecord {
  otp: string;
  phone: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

const OTP_TTL_MS   = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const otpStore = new Map<string, OTPRecord>();

export function storeOTP(phone: string, otp: string): void {
  otpStore.set(phone, {
    otp,
    phone,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    createdAt: Date.now(),
  });
}

export interface OTPVerifyResult {
  valid: boolean;
  expired: boolean;
  locked: boolean;
  attemptsLeft: number;
}

export function verifyOTP(phone: string, otp: string): OTPVerifyResult {
  const record = otpStore.get(phone);
  if (!record) return { valid: false, expired: true, locked: false, attemptsLeft: 0 };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return { valid: false, expired: true, locked: false, attemptsLeft: 0 };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { valid: false, expired: false, locked: true, attemptsLeft: 0 };
  }
  if (record.otp !== otp) {
    record.attempts++;
    const attemptsLeft = MAX_ATTEMPTS - record.attempts;
    return { valid: false, expired: false, locked: record.attempts >= MAX_ATTEMPTS, attemptsLeft };
  }
  otpStore.delete(phone);
  return { valid: true, expired: false, locked: false, attemptsLeft: MAX_ATTEMPTS };
}

export function deleteOTP(phone: string): void {
  otpStore.delete(phone);
}

export interface UserRecord {
  id: string;
  phone: string;
  createdAt: number;
  lastLoginAt: number;
}

const userStore  = new Map<string, UserRecord>();
const phoneIndex = new Map<string, string>();

function generateUserId(): string {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getOrCreateUser(phone: string): UserRecord {
  const existingId = phoneIndex.get(phone);
  if (existingId) {
    const user = userStore.get(existingId)!;
    user.lastLoginAt = Date.now();
    return user;
  }
  const user: UserRecord = { id: generateUserId(), phone, createdAt: Date.now(), lastLoginAt: Date.now() };
  userStore.set(user.id, user);
  phoneIndex.set(phone, user.id);
  return user;
}

export function getUserById(id: string): UserRecord | undefined {
  return userStore.get(id);
}

interface RefreshFamily {
  userId: string;
  token: string;
  createdAt: number;
  revokedAt?: number;
}

const refreshFamilies = new Map<string, RefreshFamily>();

export function storeRefreshFamily(family: string, userId: string, tokenHash: string): void {
  refreshFamilies.set(family, { userId, token: tokenHash, createdAt: Date.now() });
}

export function validateRefreshFamily(family: string, tokenHash: string): boolean {
  const record = refreshFamilies.get(family);
  if (!record || record.revokedAt) return false;
  return record.token === tokenHash;
}

export function rotateRefreshFamily(family: string, newTokenHash: string): void {
  const record = refreshFamilies.get(family);
  if (record) record.token = newTokenHash;
}

export function revokeRefreshFamily(family: string): void {
  const record = refreshFamilies.get(family);
  if (record) record.revokedAt = Date.now();
}

export function generateFamily(): string {
  return `fam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
