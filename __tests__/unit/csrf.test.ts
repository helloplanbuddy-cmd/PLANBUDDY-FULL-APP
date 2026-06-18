// __tests__/unit/csrf.test.ts

import { generateCSRFToken, validateCSRFToken } from '@/lib/csrf';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-32-chars-long!!!';
});

describe('CSRF Token', () => {
  test('generates a token with 3 parts', () => {
    const token = generateCSRFToken();
    expect(token.split('.').length).toBe(3);
  });

  test('generated token is valid', () => {
    const token = generateCSRFToken();
    expect(validateCSRFToken(token)).toBe(true);
  });

  test('rejects tampered token', () => {
    const token  = generateCSRFToken();
    const parts  = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.badhash`;
    expect(validateCSRFToken(tampered)).toBe(false);
  });

  test('rejects malformed token', () => {
    expect(validateCSRFToken('notavalidtoken')).toBe(false);
    expect(validateCSRFToken('')).toBe(false);
    expect(validateCSRFToken('a.b')).toBe(false);
  });

  test('rejects expired token', () => {
    // Manually craft a token with an old timestamp
    const crypto = require('crypto');
    const rand      = crypto.randomBytes(32).toString('hex');
    const oldTs     = (Date.now() - 2 * 60 * 60 * 1000).toString(36); // 2 hours ago
    const secret    = process.env.JWT_SECRET!;
    const sig       = crypto.createHmac('sha256', secret)
      .update(`${rand}:${oldTs}`)
      .digest('hex')
      .slice(0, 16);
    const expired = `${rand}.${oldTs}.${sig}`;
    expect(validateCSRFToken(expired)).toBe(false);
  });
});
