// __tests__/unit/env.test.ts

import { _resetEnvCache } from '@/lib/env';

beforeEach(() => {
  _resetEnvCache();
});

afterEach(() => {
  // Restore valid env for other tests
  process.env.JWT_SECRET        = 'test-jwt-secret-that-is-32-chars-long!!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!!!__';
  process.env.DATABASE_URL      = 'postgresql://localhost/test';
  process.env.ANTHROPIC_API_KEY  = 'test-anthropic-key-placeholder';
  _resetEnvCache();
});

describe('Environment Validation', () => {
  test('throws on missing JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    const { getEnv } = require('@/lib/env');
    expect(() => getEnv()).toThrow('JWT_SECRET');
  });

  test('throws on JWT_SECRET shorter than 32 chars', () => {
    process.env.JWT_SECRET = 'tooshort';
    const { getEnv } = require('@/lib/env');
    expect(() => getEnv()).toThrow('JWT_SECRET');
  });

  test('throws on invalid DATABASE_URL', () => {
    process.env.DATABASE_URL = 'mysql://localhost/db';
    const { getEnv } = require('@/lib/env');
    expect(() => getEnv()).toThrow('DATABASE_URL');
  });

  test('throws on missing DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    const { getEnv } = require('@/lib/env');
    expect(() => getEnv()).toThrow('DATABASE_URL');
  });

  test('returns valid env when all required vars present', () => {
    process.env.JWT_SECRET         = 'test-jwt-secret-that-is-32-chars-long!!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!!!__';
    process.env.DATABASE_URL       = 'postgresql://localhost/test';
    process.env.ANTHROPIC_API_KEY  = 'test-anthropic-key-placeholder';
    const { getEnv } = require('@/lib/env');
    const env = getEnv();
    expect(env.NODE_ENV).toBeDefined();
    expect(env.SMS_PROVIDER).toBe('mock');
  });

  test('throws when SMS_PROVIDER=twilio but Twilio creds missing', () => {
    process.env.JWT_SECRET         = 'test-jwt-secret-that-is-32-chars-long!!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!!!__';
    process.env.DATABASE_URL       = 'postgresql://localhost/test';
    process.env.ANTHROPIC_API_KEY  = 'test-anthropic-key-placeholder';
    process.env.SMS_PROVIDER       = 'twilio';
    delete process.env.TWILIO_ACCOUNT_SID;
    const { getEnv } = require('@/lib/env');
    expect(() => getEnv()).toThrow('TWILIO_ACCOUNT_SID');
    process.env.SMS_PROVIDER = 'mock';
  });
});
