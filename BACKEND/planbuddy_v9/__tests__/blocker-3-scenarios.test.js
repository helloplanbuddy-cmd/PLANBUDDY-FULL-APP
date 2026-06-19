'use strict';

const db = require('../config/db');
const crypto = require('crypto');

async function setupPaymentTest() {
  const userId = crypto.randomUUID();
  const agencyId = crypto.randomUUID();
  const tripId = crypto.randomUUID();
  const bookingId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const razorpayPaymentId = `razorpay_${crypto.randomBytes(8).toString('hex')}`;
  const refundId = `refund_${crypto.randomBytes(8).toString('hex')}`;

  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [agencyId, `agency_${agencyId.substring(0,8)}@test.com`, 'hash', 'Agency', 'agency']
  );

  await db.query(
    `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [tripId, agencyId, 'Test Trip', 'Desc', 'Loc', 10000.00, 10]
  );

  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [userId, `${userId.substring(0, 20)}@test.com`, 'test_hash', 'Test User', 'user']
  );

  await db.query(
    `INSERT INTO bookings (id, user_id, agency_id, trip_id, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [bookingId, userId, agencyId, tripId, 2, 20000.00, 20000.00, '2026-12-25', 'pending', 'unpaid']
  );

  await db.query(
    `INSERT INTO payments (id, razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [paymentId, razorpayPaymentId, bookingId, userId, 20000.00, 'created']
  );

  return { userId, bookingId, paymentId, razorpayPaymentId, refundId };
}

async function capturePayment(razorpayPaymentId, bookingId) {
  try {
    await db.transaction(async (client) => {
      const lockResult = await client.query(
        `SELECT id FROM payments WHERE razorpay_payment_id = $1 FOR UPDATE`,
        [razorpayPaymentId]
      );
      if (lockResult.rows.length === 0) throw new Error('PAYMENT_NOT_FOUND');

      await client.query(
        `UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = $1 AND status = 'pending'`,
        [bookingId]
      );

      await client.query(
        `UPDATE payments SET status = 'captured' WHERE razorpay_payment_id = $1 AND status = 'created'`,
        [razorpayPaymentId]
      );
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function refundPayment(razorpayPaymentId, bookingId, refundId) {
  try {
    await db.transaction(async (client) => {
      const lockResult = await client.query(
        `SELECT id FROM payments WHERE razorpay_payment_id = $1 FOR UPDATE`,
        [razorpayPaymentId]
      );
      if (lockResult.rows.length === 0) throw new Error('PAYMENT_NOT_FOUND');

      await client.query(
        `UPDATE payments SET status = 'refunded', refund_id = $1 WHERE razorpay_payment_id = $2 AND status IN ('captured', 'success')`,
        [refundId, razorpayPaymentId]
      );

      await client.query(
        `UPDATE bookings SET payment_status = 'refunded' WHERE id = $1`,
        [bookingId]
      );
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getState(razorpayPaymentId) {
  const result = await db.query(
    `SELECT p.status as payment_status, b.payment_status as booking_status, p.refund_id
     FROM payments p
     JOIN bookings b ON p.booking_id = b.id
     WHERE p.razorpay_payment_id = $1`,
    [razorpayPaymentId]
  );
  return result.rows[0];
}

describe('BLOCKER #3: Webhook Ordering — 5 Scenarios', () => {
  afterEach(async () => {
    try {
      await db.query(`DELETE FROM payments WHERE razorpay_payment_id LIKE 'razorpay_%'`);
    } catch (err) {
      //
    }
  });

  test('A: payment.captured → refund.processed', async () => {
    const { bookingId, razorpayPaymentId, refundId } = await setupPaymentTest();
    await capturePayment(razorpayPaymentId, bookingId);
    await refundPayment(razorpayPaymentId, bookingId, refundId);
    const final = await getState(razorpayPaymentId);

    console.log(`\nA: payment=${final.payment_status}, booking=${final.booking_status}`);
    expect(final.payment_status).toBe('refunded');
    expect(final.booking_status).toBe('refunded');
  });

  test('B: refund.processed → payment.captured', async () => {
    const { bookingId, razorpayPaymentId, refundId } = await setupPaymentTest();
    await refundPayment(razorpayPaymentId, bookingId, refundId);
    await capturePayment(razorpayPaymentId, bookingId);
    const final = await getState(razorpayPaymentId);

    console.log(`\nB: payment=${final.payment_status}, booking=${final.booking_status}`);
  });

  test('C: refund.processed → refund.processed (dup)', async () => {
    const { bookingId, razorpayPaymentId, refundId } = await setupPaymentTest();
    await capturePayment(razorpayPaymentId, bookingId);
    await refundPayment(razorpayPaymentId, bookingId, refundId);
    await refundPayment(razorpayPaymentId, bookingId, refundId);
    const final = await getState(razorpayPaymentId);

    console.log(`\nC: payment=${final.payment_status}, booking=${final.booking_status}`);
    expect(final.payment_status).toBe('refunded');
  });

  test('D: payment.captured → payment.captured (dup)', async () => {
    const { bookingId, razorpayPaymentId } = await setupPaymentTest();
    await capturePayment(razorpayPaymentId, bookingId);
    await capturePayment(razorpayPaymentId, bookingId);
    const final = await getState(razorpayPaymentId);

    console.log(`\nD: payment=${final.payment_status}, booking=${final.booking_status}`);
    expect(final.payment_status).toBe('captured');
  });

  test('E: payment.captured → refund.processed → payment.captured', async () => {
    const { bookingId, razorpayPaymentId, refundId } = await setupPaymentTest();
    await capturePayment(razorpayPaymentId, bookingId);
    await refundPayment(razorpayPaymentId, bookingId, refundId);
    await capturePayment(razorpayPaymentId, bookingId);
    const final = await getState(razorpayPaymentId);

    console.log(`\nE: payment=${final.payment_status}, booking=${final.booking_status}`);
    expect(final.payment_status).toBe('refunded');
  });
});
