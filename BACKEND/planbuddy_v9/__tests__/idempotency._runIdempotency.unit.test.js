'use strict';

// Unit tests for planbuddy_v9/middleware/idempotency.js
// Focus: _runIdempotency lock/inflight behavior + 2xx caching + error non-caching.

jest.mock('../config/env', () => ({
  IDEMPOTENCY_TTL_HOURS: 72,
}));

const mockTrackConflict = jest.fn().mockResolvedValue(undefined);
jest.mock('../middleware/Idempotencyconflictlimiter', () => ({
  trackConflict: mockTrackConflict,
}));

// Make available in test scope for expectations
const { trackConflict } = require('../middleware/Idempotencyconflictlimiter');

// DB mock (used by dbGet/dbSet)
jest.mock('../config/db', () => ({
  query: jest.fn(),
}));

// Redis mock
const mockRedis = {
  status: 'ready',
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('../config/redis', () => ({
  redis: mockRedis,
}));

const db = require('../config/db');
const idempotency = require('../middleware/idempotency');

function buildReq({
  userId = 'user_1',
  method = 'POST',
  path = '/api/bookings',
  headers = { 'idempotency-key': 'idem-key-1' },
  body = { a: 1 },
  ip = '127.0.0.1',
} = {}) {
  return {
    user: { id: userId },
    method,
    path,
    headers,
    body,
    ip,
    connection: { remoteAddress: ip },
  };
}

function buildRes() {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader: jest.fn((k, v) => {
      res.headers[k] = v;
    }),
    status: jest.fn(function status(code) {
      res.statusCode = code;
      return this;
    }),
    json: jest.fn(async function json(body) {
      res.body = body;
      return body;
    }),
  };
  return res;
}

describe('middleware/idempotency.js — _runIdempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis.get.mockResolvedValue(null);
    // First: lock acquired. Any later SET calls should still succeed.
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);

    db.query.mockResolvedValue({ rows: [] });
  });

  test('acquires lock, caches 2xx response to Redis and DB, then releases lock', async () => {
    // Cache miss
    mockRedis.get.mockResolvedValueOnce(null);

    // DB fallback GET (dbGet) returns null
    db.query.mockImplementation(async (text, params) => {
      if (String(text).includes('SELECT response_code, response_body')) {
        return { rows: [] };
      }
      if (String(text).includes('INSERT INTO idempotency_keys')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    });

    const req = buildReq({ userId: 'userA', path: '/api/payment/create-order' });
    const res = buildRes();
    const next = jest.fn();

    await idempotency._runIdempotency(req, res, next, 'idem-key-2');

    // Middleware should call next() once lock is acquired
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate controller returning success
    res.status(201);
    await res.json({ ok: true });

    // Redis cache written
    expect(mockRedis.set).toHaveBeenCalled();
    const setCalls = mockRedis.set.mock.calls.map((c) => c[0]);
    expect(setCalls.some((k) => String(k).includes('idempotency:done:'))).toBe(true);

    // DB cache written
    const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO idempotency_keys'));
    expect(insertCall).toBeDefined();

    // Lock released
    expect(mockRedis.del).toHaveBeenCalled();
  });

  test('returns 409 and calls trackConflict when lock is already in-flight', async () => {
    mockRedis.get.mockResolvedValueOnce(null);

    // lock acquisition fails (SET NX returns null/false)
    mockRedis.set.mockResolvedValueOnce(null);

    const req = buildReq({ userId: 'userB', path: '/api/bookings' });
    const res = buildRes();
    const next = jest.fn();

    await idempotency._runIdempotency(req, res, next, 'idem-key-inflight');

    expect(trackConflict).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  test('replays cached 2xx response from Redis without writing DB cache again', async () => {
    const cached = JSON.stringify({ status: 200, body: { success: true, from: 'cache' } });
    mockRedis.get.mockResolvedValueOnce(cached);

    const req = buildReq({ userId: 'userC', path: '/api/bookings' });
    const res = buildRes();
    const next = jest.fn();

    await idempotency._runIdempotency(req, res, next, 'idem-key-cache');

    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, from: 'cache' });

    // Should not cache again (no INSERT)
    const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO idempotency_keys'));
    expect(insertCall).toBeUndefined();

    expect(next).not.toHaveBeenCalled();
  });

  test('does NOT cache non-2xx responses (4xx) and still releases lock', async () => {
    mockRedis.get.mockResolvedValueOnce(null);

    db.query.mockImplementation(async (text) => {
      if (String(text).includes('SELECT response_code, response_body')) return { rows: [] };
      if (String(text).includes('INSERT INTO idempotency_keys')) return { rowCount: 1 };
      return { rows: [] };
    });

    const req = buildReq({ userId: 'userD', path: '/api/bookings/cancel' });
    const res = buildRes();
    const next = jest.fn();

    await idempotency._runIdempotency(req, res, next, 'idem-key-err');
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate error response
    res.status(400);
    await res.json({ error: 'bad request' });

    // Ensure no INSERT into idempotency_keys for non-2xx
    const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO idempotency_keys'));
    expect(insertCall).toBeUndefined();

    // Lock released
    expect(mockRedis.del).toHaveBeenCalled();
  });
});

