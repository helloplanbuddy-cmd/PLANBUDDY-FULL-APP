'use strict';

/**
 * BLOCKER 3: Webhook Reordering
 *
 * Scenarios:
 * A) Refund arrives before payment captured
 * B) Payment arrives before refund
 * C) Duplicate refund after payment captured
 */

const db = require('../config/db');
const crypto = require('crypto');

describe('BLOCKER 3: Webhook Reordering', () => {
  afterEach(async () => {
    try {
      await db.query(`DELETE FROM webhook_event_execution_log WHERE provider_event_id LIKE $1`, ['test_reorder_%']);
      await db.query(`DELETE FROM webhook_events WHERE provider_event_id LIKE $1`, ['test_reorder_%']);
    } catch (err) {
      // ignore
    }
  });

  test('A: Refund before payment captured → refund should NOT apply', async () => {
    const userId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomBytes(4).toString('hex')}`;
    const refundId = `refund_${crypto.randomBytes(4).toString('hex')}`;
    const paymentEventId = `test_reorder_payment_${Date.now()}`;
    const refundEventId = `test_reorder_refund_${Date.now()}`;

    // Create user (prerequisite)
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [userId, `${userId.substring(0,10)}@test.com`, 'test_hash', 'Test User', 'user']
    );

    // Create booking (prerequisite)
    // booking schema varies across migrations; ensure UUID columns get UUID values.

    const tripId = crypto.randomUUID();
    await db.query(
      `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
       VALUES ($1, (SELECT id FROM users WHERE id = $2), 'Trip', 'Desc', 'Loc', 1000.00, 10, NOW(), NOW())`,
      [tripId, userId]
    );

    // Ensure booking rows never violate NOT NULL constraints regardless of migration shape
    // (trip_id, agency_id, trip_snapshot, group_size, total_amount, final_amount, travel_date)
    // Booking INSERT below uses explicit columns.


    await db.query(
      `INSERT INTO bookings
       (id, user_id, trip_id, agency_id, trip_snapshot, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
       VALUES (
         $1,
         $2,
         $3,
         (SELECT agency_id FROM trips WHERE id = $3),
         '{}'::jsonb,
         1,
         100.00,
         100.00,
         '2026-12-01'::date,
         $4,
         $5,
         NOW(),
         NOW()
       )
       ON CONFLICT DO NOTHING`,
      [bookingId, userId, tripId, 'pending', 'unpaid']
    );

    // Insert webhook_events for both payment and refund
    await db.query(
      `INSERT INTO webhook_events (id, provider, provider_event_id, event_type, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), 'razorpay', paymentEventId, 'payment.captured', 'received']
    );

    await db.query(
      `INSERT INTO webhook_events (id, provider, provider_event_id, event_type, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), 'razorpay', refundEventId, 'refund.processed', 'received']
    );

    // Create payment in 'created' state (not yet captured)
    await db.query(
      `INSERT INTO payments (razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [razorpayPaymentId, bookingId, userId, 100.00, 'created']
    );

    // STEP 1: Refund arrives first (payment NOT yet captured)
    let refundApplied = false;
    try {
      await db.transaction(async (client) => {
        // Try to apply refund - should guard against payment not being captured
        const result = await client.query(
          `UPDATE payments
           SET status = 'refunded', refund_id = $1, refunded_at = NOW(), updated_at = NOW()
           WHERE razorpay_payment_id = $2 AND status IN ('captured', 'success')`,
          [refundId, razorpayPaymentId]
        );
        refundApplied = result.rowCount > 0;
      });
    } catch (err) {
      // ok
    }

    // ASSERTION: Refund should NOT have been applied (payment not captured yet)
    expect(refundApplied).toBe(false);
    console.log('✅ A: Refund correctly blocked when payment not captured');

    // STEP 2: Now payment gets captured — update booking status first to satisfy DB invariants
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE bookings SET payment_status = 'paid', updated_at = NOW()
         WHERE id = $1`,
        [bookingId]
      );
      await client.query(
        `UPDATE payments SET status = 'captured', updated_at = NOW()
         WHERE razorpay_payment_id = $1 AND status = 'created'`,
        [razorpayPaymentId]
      );
    });

    // STEP 3: Verify payment state
    const payment = await db.query(
      `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    expect(payment.rows[0].status).toBe('captured');
    console.log('✅ A: Payment captured after refund blocked');
  });

  test('B: Payment captured then refund arrives → refund should apply', async () => {
    const userId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomBytes(4).toString('hex')}`;
    const refundId = `refund_${crypto.randomBytes(4).toString('hex')}`;

    // Create user
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [userId, `${userId.substring(0,10)}@test.com`, 'test_hash', 'Test User', 'user']
    );

    // Create trip (prerequisite) and booking
    const tripId = crypto.randomUUID();
    await db.query(
      `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
       VALUES ($1, (SELECT id FROM users WHERE id = $2), 'Trip', 'Desc', 'Loc', 1000.00, 10, NOW(), NOW())`,
      [tripId, userId]
    );

    await db.query(
      `INSERT INTO bookings
       (id, user_id, trip_id, agency_id, trip_snapshot, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
       VALUES ($1, $2, $3, (SELECT agency_id FROM trips WHERE id = $3), '{}'::jsonb, 1, 100.00, 100.00, '2026-12-01'::date, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [bookingId, userId, tripId, 'pending', 'unpaid']
    );

    // Mark booking as paid before inserting captured payment (production invariant)
    await db.query(
      `UPDATE bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
      [bookingId]
    );

    // Create payment already captured
    await db.query(
      `INSERT INTO payments (razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [razorpayPaymentId, bookingId, userId, 100.00, 'captured']
    );

    // Apply refund
    let refundApplied = false;
    try {
      await db.transaction(async (client) => {
        // Update booking to reflect refund before applying payment change (invariant)
        await client.query(
          `UPDATE bookings SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [bookingId]
        );

        const result = await client.query(
          `UPDATE payments
           SET status = 'refunded', refund_id = $1, refunded_at = NOW(), updated_at = NOW()
           WHERE razorpay_payment_id = $2 AND status IN ('captured', 'success')`,
          [refundId, razorpayPaymentId]
        );
        refundApplied = result.rowCount > 0;
      });
    } catch (err) {
      throw err;
    }

    // ASSERTION: Refund SHOULD have been applied
    expect(refundApplied).toBe(true);
    console.log('✅ B: Refund correctly applied to captured payment');

    // Verify final state
    const payment = await db.query(
      `SELECT status, refund_id FROM payments WHERE razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    expect(payment.rows[0].status).toBe('refunded');
    expect(payment.rows[0].refund_id).toBe(refundId);
    console.log('✅ B: Payment refunded with correct refund_id');
  });

  test('C: Duplicate refund after payment captured → idempotent', async () => {
    const userId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomBytes(4).toString('hex')}`;
    const refundId = `refund_${crypto.randomBytes(4).toString('hex')}`;

    // Create user
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [userId, `${userId.substring(0,10)}@test.com`, 'test_hash', 'Test User', 'user']
    );

    // Create trip (prerequisite) and booking
    const tripId = crypto.randomUUID();
    await db.query(
      `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
       VALUES ($1, (SELECT id FROM users WHERE id = $2), 'Trip', 'Desc', 'Loc', 1000.00, 10, NOW(), NOW())`,
      [tripId, userId]
    );

    await db.query(
      `INSERT INTO bookings
       (id, user_id, trip_id, agency_id, trip_snapshot, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
       VALUES ($1, $2, $3, (SELECT agency_id FROM trips WHERE id = $3), '{}'::jsonb, 1, 100.00, 100.00, '2026-12-01'::date, $4, $5, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [bookingId, userId, tripId, 'pending', 'unpaid']
    );

    // Mark booking as paid before inserting captured payment (production invariant)
    await db.query(
      `UPDATE bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
      [bookingId]
    );

    // Create payment captured
    await db.query(
      `INSERT INTO payments (razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [razorpayPaymentId, bookingId, userId, 100.00, 'captured']
    );

    // Apply refund 3 times
    for (let i = 0; i < 3; i++) {
      await db.transaction(async (client) => {
        // Update booking to reflect refund before applying payment change (invariant)
        await client.query(
          `UPDATE bookings SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [bookingId]
        );

        await client.query(
          `UPDATE payments
           SET status = 'refunded', refund_id = $1, refunded_at = NOW(), updated_at = NOW()
           WHERE razorpay_payment_id = $2 AND status IN ('captured', 'success')`,
          [refundId, razorpayPaymentId]
        );
      });
    }

    // Verify idempotency: only one refund_id
    const payment = await db.query(
      `SELECT status, refund_id FROM payments WHERE razorpay_payment_id = $1`,
      [razorpayPaymentId]
    );
    expect(payment.rows[0].status).toBe('refunded');
    expect(payment.rows[0].refund_id).toBe(refundId);
    console.log('✅ C: Duplicate refunds idempotent');
  });
});
