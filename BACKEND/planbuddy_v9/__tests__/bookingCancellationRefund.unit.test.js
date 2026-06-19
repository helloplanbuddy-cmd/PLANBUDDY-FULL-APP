'use strict';

const db = require('../config/db');
const RefundService = require('../services/refundService');
const EmailService = require('../services/emailService');

jest.mock('../config/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../services/refundService', () => ({
  initiateRefund: jest.fn().mockResolvedValue({ razorpayRefundId: 'r1', amount: null, status: 'processed' }),
}));
jest.mock('../services/emailService', () => ({ sendBookingCancellation: jest.fn() }));

const bookingController = require('../controllers/bookingController');

describe('Booking cancellation refund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should call RefundService.initiateRefund with correct explicit args for full refund', async () => {
    const bookingId = 'booking-abc-123';
    const existingBooking = {
      id: bookingId,
      user_id: 'user-123',
      status: 'confirmed',
      payment_status: 'paid',
      trip_title: 'Test Trip',
    };

    // transaction phase1 uses client.query, not db.query
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [existingBooking] }) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ id: bookingId }] }) // UPDATE ... RETURNING
        .mockResolvedValueOnce({ rows: [existingBooking] }), // SELECT b.*, t.title ... (used by RefundService path)
    };

    db.transaction.mockImplementation(async (cb) => cb(client));

    // non-transaction calls inside controller
    // Controller does:
    // 1) bookings SELECT (expects booking row-like shape)
    // 2) users SELECT
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: bookingId,
            status: 'cancellation_pending',
            payment_status: 'paid',
            group_size: null,
            slot_id: null,
            total_amount: null,
            travel_date: null,
            created_at: null,
            expires_at: null,
            trip_snapshot: null,
            trip_title: 'Test Trip',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'user-123', email: 'user@test.com', name: 'Test User' }],
      });



    const req = {
      params: { bookingId },
      body: { reason: 'Changed plans' },
      user: { id: 'user-123', role: 'user' },
      requestId: 'req-999',
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await bookingController.cancelBooking(req, res, next);

    expect(RefundService.initiateRefund).toHaveBeenCalledTimes(1);
    expect(RefundService.initiateRefund).toHaveBeenCalledWith(
      bookingId,
      null,
      'Changed plans',
      'user-123'
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('Booking cancelled and refund initiated'),
    }));
  });

  test('should return idempotent booking cancellation in progress when update claim fails', async () => {
    const bookingId = 'booking-inflight-123';
    const existingBooking = {
      id: bookingId,
      user_id: 'user-456',
      status: 'confirmed',
      payment_status: 'paid',
      trip_title: 'Test Trip',
    };

    // Transaction phase1 uses client.query, not db.query
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [existingBooking] }) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }), // UPDATE ... RETURNING (claim fails)
    };

    db.transaction.mockImplementation(async (cb) => cb(mockClient));


    const req = {
      params: { bookingId },
      body: { reason: 'Duplicate request' },
      user: { id: 'user-456', role: 'user' },
      requestId: 'req-1000',
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await bookingController.cancelBooking(req, res, next);

    expect(RefundService.initiateRefund).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Booking cancellation already in progress.',
    }));
  });
});
