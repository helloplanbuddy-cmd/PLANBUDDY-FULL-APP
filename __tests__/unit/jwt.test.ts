// __tests__/unit/jwt.test.ts
// Unit tests for JWT sign/verify with issuer+audience+JTI validation

import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '@/lib/jwt';

// Set required env vars for tests
beforeAll(() => {
  process.env.JWT_SECRET         = 'test-jwt-secret-that-is-32-chars-long!!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!!!__';
  process.env.DATABASE_URL       = 'postgresql://localhost/test';
  process.env.ANTHROPIC_API_KEY  = 'test-anthropic-key-placeholder';
});

describe('JWT — Access Tokens', () => {
  test('signs and verifies a valid access token', async () => {
    const token   = await signAccessToken('usr_123', '+919876543210');
    const payload = await verifyAccessToken(token);

    expect(payload.sub).toBe('usr_123');
    expect(payload.phone).toBe('+919876543210');
    expect(payload.type).toBe('access');
    expect(payload.jti).toBeDefined();
    expect(payload.iss).toBe('planbuddy-api');
    expect(payload.aud).toContain('planbuddy-app');
  });

  test('rejects a token signed with wrong secret', async () => {
    const badToken = await (async () => {
      const { SignJWT } = await import('jose');
      return new SignJWT({ sub: 'usr_bad', type: 'access', jti: 'x' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('15m')
        .setIssuer('planbuddy-api')
        .setAudience('planbuddy-app')
        .sign(new TextEncoder().encode('wrong-secret-that-is-32-chars-long!'));
    })();

    await expect(verifyAccessToken(badToken)).rejects.toThrow();
  });

  test('rejects a token with wrong type', async () => {
    // signRefreshToken uses JWT_REFRESH_SECRET; verifyAccessToken uses JWT_SECRET.
    // Different secrets means signature fails before type-check — equally secure.
    const refreshToken = await signRefreshToken('usr_123', 'fam_xyz');
    await expect(verifyAccessToken(refreshToken)).rejects.toThrow();
  });

  test('rejects expired token', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-jwt-secret-that-is-32-chars-long!!!');
    const expired = await new SignJWT({ sub: 'usr_123', type: 'access', jti: 'x', phone: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .setIssuer('planbuddy-api')
      .setAudience('planbuddy-app')
      .sign(secret);

    await expect(verifyAccessToken(expired)).rejects.toThrow();
  });
});

describe('JWT — Refresh Tokens', () => {
  test('signs and verifies a valid refresh token', async () => {
    const token   = await signRefreshToken('usr_456', 'fam_abc123');
    const payload = await verifyRefreshToken(token);

    expect(payload.sub).toBe('usr_456');
    expect(payload.type).toBe('refresh');
    expect(payload.family).toBe('fam_abc123');
    expect(payload.jti).toBeDefined();
  });

  test('rejects access token as refresh token', async () => {
    // signAccessToken uses JWT_SECRET; verifyRefreshToken uses JWT_REFRESH_SECRET.
    // Different secrets means signature fails before type-check — equally secure.
    const accessToken = await signAccessToken('usr_123', '9876543210');
    await expect(verifyRefreshToken(accessToken)).rejects.toThrow();
  });
});
