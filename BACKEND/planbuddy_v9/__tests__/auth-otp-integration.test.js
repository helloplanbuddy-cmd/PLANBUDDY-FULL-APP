'use strict';

// OTP integration-style test (controller + OTP service), using mocks.
// Goal: ensure OTP flow executes without Jest parse/runtime blockers.

jest.mock('../config/redis', () => {
  // Simple in-memory redis-like mock.
  const store = new Map();
  return {
    redis: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value /*, ex?, ttl? */) => {
        store.set(key, value);
        return 'OK';
      },
      status: 'ready',
      ping: async () => 'PONG',
      quit: async () => {},
    },
  };
});

jest.mock('../config/db', () => {
  // Minimal DB stub for users table.
  const usersByPhone = new Map();
  let idSeq = 1;
  return {
    query: async (text, params) => {
      // SELECT id, phone FROM users WHERE phone = $1
      if (text.startsWith('SELECT id, phone FROM users WHERE phone')) {
        const phone = params[0];
        if (!usersByPhone.has(phone)) return { rows: [] };
        return { rows: [usersByPhone.get(phone)] };
      }

      // INSERT INTO users (phone, created_at)
      if (text.startsWith('INSERT INTO users (phone')) {
        const phone = params[0];
        const row = { id: String(idSeq++), phone };
        usersByPhone.set(phone, row);
        return { rows: [row] };
      }

      throw new Error(`Unexpected db.query: ${text}`);
    },
  };
});

jest.mock('../services/smsService', () => {
  return {
    sendOTP: async (phone) => ({ otp: '123456', success: true }),
  };
});

jest.mock('../services/refreshTokenService', () => {
  return {
    createRefreshToken: async () => ({ refreshToken: 'rft_mock' }),
  };
});

jest.mock('../utils/jwt', () => {
  return {
    generateToken: () => ({ token: 'access_mock' }),
  };
});

const otpController = require('../controllers/otpController');
const { storeOTP } = require('../services/otpService');

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

function mockReq({ body = {}, ip = '127.0.0.1', headers = {} } = {}) {
  return {
    body,
    ip,
    get: (name) => headers[name] || headers[name.toLowerCase()] || null,
    headers,
  };
}

describe('OTP auth integration (controller + service) — smoke & behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sendOtp -> stores OTP and returns success', async () => {
    const req = mockReq({ body: { phone: '9876543210' }, headers: { 'x-device-id': 'dev1' } });
    const res = mockRes();

    await otpController.sendOtp(req, res, (err) => {
      if (err) throw err;
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('OTP sent');
  });

  test('verifyOtp -> validates OTP and returns access + refresh tokens', async () => {
    // Pre-store OTP directly so verifyOTP can succeed.
    await storeOTP('9876543210', '123456', { ipAddress: '127.0.0.1', deviceId: 'dev1' });

    const req = mockReq({
      body: { phone: '9876543210', otp: '123456' },
      headers: { 'user-agent': 'jest-agent' },
    });
    const res = mockRes();

    await otpController.verifyOtp(req, res, (err) => {
      if (err) throw err;
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access_mock');
    expect(res.body.data.refreshToken).toBe('rft_mock');
    expect(res.body.data.user.phone).toBe('9876543210');
  });

  test('verifyOtp -> invalid OTP returns 401', async () => {
    await storeOTP('9876543210', '123456', { ipAddress: '127.0.0.1', deviceId: 'dev1' });

    const req = mockReq({ body: { phone: '9876543210', otp: '000000' } });
    const res = mockRes();

    await otpController.verifyOtp(req, res, (err) => {
      if (err) throw err;
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

