// ============================================================
// lib/redisRateLimit.ts — Distributed rate limiting via Upstash Redis
// Phase 2A: Replaces in-memory Map() rate limiter in rateLimit.ts
//
// Falls back to in-memory if Redis is not configured (dev/test).
// Always safe to import — never throws on missing config.
// ============================================================

import { logger } from './logger';

// ── Types ─────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAt:   number; // unix ms
  limit:     number;
}

interface RedisClient {
  pipeline(): {
    zadd(key: string, score: number, member: string): void;
    zremrangebyscore(key: string, min: number, max: number): void;
    zcard(key: string): void;
    expire(key: string, seconds: number): void;
    exec(): Promise<unknown[]>;
  };
}

// ── Redis Client Init (lazy) ───────────────────────────────

let _redis: RedisClient | null = null;
let _redisAvailable: boolean | null = null;

async function getRedis(): Promise<RedisClient | null> {
  if (_redisAvailable === false) return null;
  if (_redis) return _redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _redisAvailable = false;
    logger.warn('Redis not configured — rate limiting using in-memory fallback');
    return null;
  }

  try {
    const { Redis } = await import('@upstash/redis');
    _redis = new Redis({ url, token }) as unknown as RedisClient;
    _redisAvailable = true;
    return _redis;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

// ── Core: Sliding Window Rate Limit ───────────────────────

async function slidingWindow(
  key:        string,
  windowMs:   number,
  maxRequests: number
): Promise<RateLimitResult> {
  const redis = await getRedis();
  const now   = Date.now();
  const windowStart = now - windowMs;

  if (redis) {
    try {
      // Use Upstash @upstash/ratelimit if available
      const { Ratelimit } = await import('@upstash/ratelimit');
      const { Redis }     = await import('@upstash/redis');

      const ratelimit = new Ratelimit({
        redis: new Redis({
          url:   process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        }),
        limiter: Ratelimit.slidingWindow(maxRequests, `${Math.floor(windowMs / 1000)} s`),
        prefix: 'pb:rl',
      });

      const result = await ratelimit.limit(key);
      return {
        allowed:   result.success,
        remaining: result.remaining,
        resetAt:   result.reset,
        limit:     result.limit,
      };
    } catch (err) {
      logger.warn({ err }, 'Redis rate limit failed — using in-memory fallback');
    }
  }

  // In-memory fallback (single-instance only)
  return inMemoryFallback(key, windowMs, maxRequests);
}

// ── In-memory fallback ─────────────────────────────────────

const _fallbackStore = new Map<string, number[]>();

function inMemoryFallback(
  key:         string,
  windowMs:    number,
  maxRequests: number
): RateLimitResult {
  const now         = Date.now();
  const windowStart = now - windowMs;

  let timestamps = _fallbackStore.get(key) ?? [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= maxRequests) {
    const resetAt = (timestamps[0] ?? now) + windowMs;
    return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
  }

  timestamps.push(now);
  _fallbackStore.set(key, timestamps);
  return {
    allowed:   true,
    remaining: maxRequests - timestamps.length,
    resetAt:   now + windowMs,
    limit:     maxRequests,
  };
}

// ── Pre-configured limiters ────────────────────────────────

/** 3 OTP sends per phone per 10 minutes */
export async function limitSendOTP(phone: string): Promise<RateLimitResult> {
  return slidingWindow(`send-otp:${phone}`, 10 * 60_000, 3);
}

/** 5 OTP verifications per phone per 5 minutes */
export async function limitVerifyOTP(phone: string): Promise<RateLimitResult> {
  return slidingWindow(`verify-otp:${phone}`, 5 * 60_000, 5);
}

/** Per-IP OTP rate limit: 10 sends per IP per hour */
export async function limitSendOTPByIP(ip: string): Promise<RateLimitResult> {
  return slidingWindow(`send-otp-ip:${ip}`, 60 * 60_000, 10);
}

/** 60 chat requests per user per hour */
export async function limitChat(userId: string): Promise<RateLimitResult> {
  return slidingWindow(`chat:${userId}`, 60 * 60_000, 60);
}

/** 10 plan generations per user per day */
export async function limitPlan(userId: string): Promise<RateLimitResult> {
  return slidingWindow(`plan:${userId}`, 24 * 60 * 60_000, 10);
}

/** 20 memory summaries per user per day */
export async function limitMemories(userId: string): Promise<RateLimitResult> {
  return slidingWindow(`memories:${userId}`, 24 * 60 * 60_000, 20);
}
