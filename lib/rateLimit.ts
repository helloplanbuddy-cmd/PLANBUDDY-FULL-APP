// ============================================================
// lib/rateLimit.ts — DEPRECATED (Phase 2A)
// ============================================================
// STATUS: DEPRECATED — Do not use in new code.
// REPLACEMENT: lib/redisRateLimit.ts (Redis/Upstash-backed)
// MIGRATION: All callers migrated to redisRateLimit in Phase 2A.
// REMOVAL: Safe to remove after confirming dbRateLimit is stable.
//
// KEPT AS-IS — no functionality removed (File Preservation Policy).
// ============================================================

interface RateLimitRecord { timestamps: number[]; }
const store = new Map<string, RateLimitRecord>();

export interface RateLimitConfig { windowMs: number; maxRequests: number; }
export interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number; }

export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now(); const windowStart = now - config.windowMs;
  let record = store.get(key);
  if (!record) { record = { timestamps: [] }; store.set(key, record); }
  record.timestamps = record.timestamps.filter((t) => t > windowStart);
  if (record.timestamps.length >= config.maxRequests) {
    const oldest = record.timestamps[0];
    return { allowed: false, remaining: 0, resetAt: oldest + config.windowMs };
  }
  record.timestamps.push(now);
  return { allowed: true, remaining: config.maxRequests - record.timestamps.length, resetAt: now + config.windowMs };
}

export function limitSendOTP(phone: string): RateLimitResult {
  return rateLimit(`send-otp:${phone}`, { windowMs: 10 * 60_000, maxRequests: 3 });
}
export function limitVerifyOTP(phone: string): RateLimitResult {
  return rateLimit(`verify-otp:${phone}`, { windowMs: 5 * 60_000, maxRequests: 5 });
}
export function limitChat(userId: string): RateLimitResult {
  return rateLimit(`chat:${userId}`, { windowMs: 60 * 60_000, maxRequests: 60 });
}
export function limitPlan(userId: string): RateLimitResult {
  return rateLimit(`plan:${userId}`, { windowMs: 24 * 60 * 60_000, maxRequests: 10 });
}
export function limitMemories(userId: string): RateLimitResult {
  return rateLimit(`memories:${userId}`, { windowMs: 24 * 60 * 60_000, maxRequests: 20 });
}

interface UsageRecord { tokens: number; requests: number; dailyTokens: number; dayKey: string; }
const usageStore = new Map<string, UsageRecord>();
const DAILY_TOKEN_CAP = 50_000;

export function trackAIUsage(userId: string, tokens: number): { overBudget: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  let rec = usageStore.get(userId);
  if (!rec || rec.dayKey !== today) { rec = { tokens: 0, requests: 0, dailyTokens: 0, dayKey: today }; usageStore.set(userId, rec); }
  rec.tokens += tokens; rec.requests += 1; rec.dailyTokens += tokens;
  return { overBudget: rec.dailyTokens > DAILY_TOKEN_CAP };
}
export function getAIUsage(userId: string): UsageRecord | undefined { return usageStore.get(userId); }
