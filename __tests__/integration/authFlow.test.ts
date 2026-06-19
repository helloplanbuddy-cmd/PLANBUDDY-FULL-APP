// __tests__/integration/authFlow.test.ts
// Integration tests for the complete authentication flow.
// These tests mock DB and Redis but exercise the full route logic.

import { createMocks } from 'node-mocks-http';
import { NextRequest } from 'next/server';

// ── Environment Setup ──────────────────────────────────────

beforeAll(() => {
  process.env.JWT_SECRET         = 'integration-jwt-secret-32-chars!!!!!';
  process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-32chars!!';
  process.env.DATABASE_URL       = 'postgresql://localhost/test';
  process.env.ANTHROPIC_API_KEY  = 'test-key-for-integration-tests-min10';
  process.env.SMS_PROVIDER       = 'mock';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  // NODE_ENV is read-only in TypeScript; Jest sets it to 'test' automatically

  // Reset the env cache so getEnv() picks up the values set above
  const { _resetEnvCache } = require('@/lib/env');
  _resetEnvCache();
});

// ── Mock DB ───────────────────────────────────────────────

jest.mock('@/lib/db', () => ({
  db: {
    otpCode: {
      findFirst:   jest.fn(),
      create:      jest.fn(),
      update:      jest.fn(),
      updateMany:  jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create:     jest.fn(),
    },
    userSession: {
      create:     jest.fn(),
      updateMany: jest.fn(),
      findMany:   jest.fn(),
    },
    refreshToken: {
      create:     jest.fn(),
      findUnique: jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
    },
    aiUsage: {
      create:    jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalTokens: 0, costUsd: 0 }, _count: { id: 0 } }),
    },
  },
}));

// ── Mock Redis rate limiter ────────────────────────────────

jest.mock('@/lib/redisRateLimit', () => ({
  limitSendOTP:    jest.fn().mockResolvedValue({ allowed: true, remaining: 2, resetAt: Date.now() + 60000, limit: 3 }),
  limitVerifyOTP:  jest.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000, limit: 5 }),
  limitSendOTPByIP:jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000, limit: 10 }),
  limitChat:       jest.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000, limit: 60 }),
}));

// ── Mock SMS ───────────────────────────────────────────────

jest.mock('@/lib/sms', () => ({
  sendOTP: jest.fn().mockResolvedValue({ otp: '654321', success: true }),
}));

// ── Mock Analytics ─────────────────────────────────────────

jest.mock('@/lib/analytics', () => ({
  Analytics: {
    otpSent:          jest.fn().mockResolvedValue(undefined),
    otpVerified:      jest.fn().mockResolvedValue(undefined),
    sessionRefreshed: jest.fn().mockResolvedValue(undefined),
    logout:           jest.fn().mockResolvedValue(undefined),
    rateLimitHit:     jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/monitoring', () => ({
  captureException: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock dbSessionStore ────────────────────────────────────
// Route handlers call dbSessionStore functions which use the db Proxy.
// Mock at the module level to prevent PrismaClient initialization in tests.

jest.mock('@/lib/dbSessionStore', () => ({
  storeOTP:             jest.fn().mockResolvedValue(undefined),
  verifyOTPHash:        jest.fn(),
  getOrCreateUser:      jest.fn(),
  getUserById:          jest.fn(),
  createDeviceSession:  jest.fn().mockResolvedValue('sess_abc'),
  invalidateSessions:   jest.fn().mockResolvedValue(undefined),
  storeRefreshFamily:   jest.fn().mockResolvedValue(undefined),
  generateFamily:       jest.fn().mockReturnValue('fam_test'),
  generateDeviceId:     jest.fn().mockReturnValue('dev_test'),
}));

// ── Helper ────────────────────────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  cookies?: Record<string, string>
): NextRequest {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'origin': 'http://localhost:3000',
      ...(cookies ? { cookie: Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ') } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return new NextRequest(req);
}

// ── Tests ─────────────────────────────────────────────────

describe('Auth Flow — send-otp', () => {
  beforeEach(() => {
    const store = require('@/lib/dbSessionStore');
    store.storeOTP.mockResolvedValue(undefined);
  });

  test('POST /api/auth/send-otp returns 200 with valid phone', async () => {
    const { POST } = await import('@/app/api/auth/send-otp/route');
    const req = makeRequest('POST', '/api/auth/send-otp', { phone: '9876543210' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('OTP sent successfully');
    expect(body.expiresIn).toBe(300);
  });

  test('POST /api/auth/send-otp returns 400 for invalid phone', async () => {
    const { POST } = await import('@/app/api/auth/send-otp/route');
    const req = makeRequest('POST', '/api/auth/send-otp', { phone: '1234567890' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/send-otp returns 429 when rate limited', async () => {
    const { limitSendOTP } = require('@/lib/redisRateLimit');
    limitSendOTP.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000, limit: 3 });

    const { POST } = await import('@/app/api/auth/send-otp/route');
    const req = makeRequest('POST', '/api/auth/send-otp', { phone: '9876543210' });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});

describe('Auth Flow — verify-otp', () => {
  beforeEach(() => {
    const store = require('@/lib/dbSessionStore');
    // Default: valid OTP scenario
    store.verifyOTPHash.mockResolvedValue({
      valid: true,
      expired: false,
      locked: false,
      attemptsLeft: 4,
    });
    store.getOrCreateUser.mockResolvedValue({
      id: 'usr_test123',
      phone: '9876543210',
      createdAt: new Date(),
    });
    store.createDeviceSession.mockResolvedValue('sess_abc');
    store.storeRefreshFamily.mockResolvedValue(undefined);
  });

  test('POST /api/auth/verify-otp returns 200 with valid OTP', async () => {
    const { POST } = await import('@/app/api/auth/verify-otp/route');
    const req = makeRequest('POST', '/api/auth/verify-otp', { phone: '9876543210', otp: '654321' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('usr_test123');
    expect(body.accessToken).toBeDefined();
  });

  test('POST /api/auth/verify-otp returns 401 with wrong OTP', async () => {
    const store = require('@/lib/dbSessionStore');
    store.verifyOTPHash.mockResolvedValue({
      valid: false,
      expired: false,
      locked: false,
      attemptsLeft: 3,
    });

    const { POST } = await import('@/app/api/auth/verify-otp/route');
    const req = makeRequest('POST', '/api/auth/verify-otp', { phone: '9876543210', otp: '000000' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/verify-otp returns 401 for expired OTP', async () => {
    const store = require('@/lib/dbSessionStore');
    store.verifyOTPHash.mockResolvedValue({
      valid: false,
      expired: true,
      locked: false,
      attemptsLeft: 0,
    });

    const { POST } = await import('@/app/api/auth/verify-otp/route');
    const req = makeRequest('POST', '/api/auth/verify-otp', { phone: '9876543210', otp: '654321' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
