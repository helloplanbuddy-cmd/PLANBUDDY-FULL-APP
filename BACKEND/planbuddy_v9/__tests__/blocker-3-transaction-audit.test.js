'use strict';

const db = require('../config/db');
const crypto = require('crypto');

describe('BLOCKER #3: Transaction Boundary Audit', () => {
  let testData;

  beforeAll(async () => {
    // Setup
    const userId = crypto.randomUUID();
    const agencyId = crypto.randomUUID();
    const tripId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomBytes(8).toString('hex')}`;
    const refundId = `refund_${crypto.randomBytes(8).toString('hex')}`;

    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [agencyId, `agency_${agencyId.substring(0,8)}@test.com`, 'hash', 'Agency', 'agency']
    );

    await db.query(
      `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [tripId, agencyId, 'Test Trip', 'Desc', 'Loc', 10000.00, 10]
    );

    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [userId, `${userId.substring(0, 20)}@test.com`, 'test_hash', 'Test User', 'user']
    );

    await db.query(
      `INSERT INTO bookings (id, user_id, agency_id, trip_id, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [bookingId, userId, agencyId, tripId, 2, 20000.00, 20000.00, '2026-12-25', 'pending', 'unpaid']
    );

    await db.query(
      `INSERT INTO payments (id, razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [paymentId, razorpayPaymentId, bookingId, userId, 20000.00, 'created']
    );

    testData = { bookingId, razorpayPaymentId, refundId };
  });

  test('Audit: capture succeeds, refund fails at trigger, transaction rollback confirmed', async () => {
    const { bookingId, razorpayPaymentId, refundId } = testData;

    // STEP 1: Verify initial state
    let row = await db.query(
      `SELECT p.status p_status, b.status b_status, b.payment_status b_payment_status
       FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE p.razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    console.log('\n[INIT] payment=' + row.rows[0].p_status + ', booking=' + row.rows[0].b_status + ', payment_status=' + row.rows[0].b_payment_status);
    expect(row.rows[0].p_status).toBe('created');
    expect(row.rows[0].b_payment_status).toBe('unpaid');

    // STEP 2: Capture (should succeed)
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = $1 AND status = 'pending'`,
        [bookingId]
      );
      await client.query(
        `UPDATE payments SET status = 'captured' WHERE razorpay_payment_id = $1 AND status = 'created'`,
        [razorpayPaymentId]
      );
    });

    row = await db.query(
      `SELECT p.status p_status, b.status b_status, b.payment_status b_payment_status
       FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE p.razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    console.log('[CAPTURE] payment=' + row.rows[0].p_status + ', booking=' + row.rows[0].b_status + ', payment_status=' + row.rows[0].b_payment_status);
    expect(row.rows[0].p_status).toBe('captured');
    expect(row.rows[0].b_payment_status).toBe('paid');

    // STEP 3: Try refund (WITHOUT updating booking)
    // The deferred invariant trigger fires at COMMIT time.
    // Updating payment.status='refunded' while booking.payment_status='paid'
    // violates the invariant and must cause a rollback.
    let refundException = null;
    try {
      await db.transaction(async (client) => {
        console.log('[REFUND] Attempting to update payment status to refunded (trigger should block at COMMIT)');
        
        const paymentUpdateResult = await client.query(
          `UPDATE payments SET status = 'refunded', refund_id = $1 WHERE razorpay_payment_id = $2 AND status IN ('captured', 'success')`,
          [refundId, razorpayPaymentId]
        );
        console.log('[REFUND] Payment UPDATE result: ' + paymentUpdateResult.rowCount + ' rows');
        
        // NOTE: intentionally NOT updating booking.payment_status
        // The deferred trigger should fire at COMMIT and detect inconsistency
      });
    } catch (err) {
      refundException = err;
      console.log('[REFUND] EXCEPTION CAUGHT: ' + err.message);
    }

    // STEP 4: Verify state after refund attempt
    row = await db.query(
      `SELECT p.status p_status, b.status b_status, b.payment_status b_payment_status
       FROM payments p JOIN bookings b ON p.booking_id = b.id WHERE p.razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    console.log('[AFTER-REFUND] payment=' + row.rows[0].p_status + ', booking=' + row.rows[0].b_status + ', payment_status=' + row.rows[0].b_payment_status);

    // If refund threw exception and transaction rolled back, state should be unchanged
    expect(row.rows[0].p_status).toBe('captured');
    expect(row.rows[0].b_payment_status).toBe('paid');
    expect(refundException).not.toBeNull();
    expect(refundException.message).toContain('INVARIANT_VIOLATION');

    console.log('\n✓ CONCLUSION: Transaction rolled back completely. Both payment and booking states unchanged after failed refund.');
  });

  afterAll(async () => {
    try {
      await db.query(`DELETE FROM payments WHERE razorpay_payment_id LIKE 'razorpay_%'`);
    } catch (err) {
      // ignore
    }
  });
});
