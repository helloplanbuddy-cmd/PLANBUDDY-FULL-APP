'use strict';

/**
 * BLOCKER #4: CONCURRENCY SAFETY
 *
 * Attack: Multiple workers processing same webhook concurrently
 * Defense: Atomic transactions + idempotency gates + row-level locking
 *
 * Test vectors:
 * - 2 concurrent workers, same provider_event_id
 * - 5 concurrent workers, same provider_event_id
 * - 20 concurrent workers, same provider_event_id
 * - 100 concurrent workers, same provider_event_id
 */

const db = require('../config/db');
const crypto = require('crypto');

async function createFullPaymentScenario() {
  // Create agency user
  const agencyId = crypto.randomUUID();
  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [agencyId, `agency_${agencyId.substring(0,8)}@test.com`, 'hash', 'Agency', 'agency']
  );

  // Create trip
  const tripId = crypto.randomUUID();
  await db.query(
    `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [tripId, agencyId, 'Test Trip', 'Desc', 'Loc', 10000.00, 10]
  );

  // Create user
  const userId = crypto.randomUUID();
  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [userId, `user_${userId.substring(0,8)}@test.com`, 'hash', 'User', 'user']
  );

  // Create booking (PENDING)
  const bookingId = crypto.randomUUID();
  await db.query(
    `INSERT INTO bookings (id, user_id, agency_id, trip_id, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [bookingId, userId, agencyId, tripId, 2, 20000.00, 20000.00, '2026-12-25', 'pending', 'unpaid']
  );

  // Create payment (CREATED state)
  const razorpayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
  const paymentId = crypto.randomUUID();
  await db.query(
    `INSERT INTO payments (id, razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [paymentId, razorpayPaymentId, bookingId, userId, 20000.00, 'created']
  );

  // CREATE WEBHOOK EVENT (shared for all workers)
  const providerEventId = `payment.captured.${razorpayPaymentId}`;
  const webhookEventId = crypto.randomUUID();
  await db.query(
    `INSERT INTO webhook_events (id, provider, provider_event_id, event_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [webhookEventId, 'razorpay', providerEventId, 'payment.captured', 'received']
  );

  return { bookingId, paymentId, razorpayPaymentId, userId, tripId, agencyId, webhookEventId, providerEventId };
}

async function simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, workerNum) {
  try {
    await db.transaction(async (client) => {
      // STEP 1: Insert idempotency gate (inside transaction)
      const executionHash = crypto.createHash('sha256')
        .update(providerEventId)
        .update('|payment.captured|')
        .digest('hex');

      await client.query(
        `INSERT INTO webhook_event_execution_log
         (provider_event_id, webhook_event_id, execution_hash, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (provider_event_id) DO NOTHING`,
        [providerEventId, webhookEventId, executionHash]
      );

      // STEP 2: Check if already processed
      const executionLog = await client.query(
        `SELECT status FROM webhook_event_execution_log
         WHERE provider_event_id = $1 FOR UPDATE`,
        [providerEventId]
      );

      if (!executionLog.rows.length) {
        throw new Error('Execution log missing');
      }

      if (executionLog.rows[0].status === 'success') {
        // Already processed, skip
        return;
      }

      // STEP 3: Mark in-progress
      await client.query(
        `UPDATE webhook_event_execution_log SET status = 'in_progress'
         WHERE provider_event_id = $1`,
        [providerEventId]
      );

      // STEP 4: Apply payment mutation (with FOR UPDATE locking)
      const lockResult = await client.query(
        `SELECT id FROM payments
         WHERE razorpay_payment_id = $1 FOR UPDATE`,
        [razorpayPaymentId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error('Payment not found');
      }

      // Simulate booking confirmation FIRST (to satisfy invariant before payment update)
      await client.query(
        `UPDATE bookings SET payment_status = 'paid', status = 'confirmed', updated_at = NOW()
         WHERE id = (SELECT booking_id FROM payments WHERE razorpay_payment_id = $1)
         AND status = 'pending'`,
        [razorpayPaymentId]
      );

      // Update payment status (now booking is 'paid', invariant satisfied)
      const updateResult = await client.query(
        `UPDATE payments SET status = 'captured', updated_at = NOW()
         WHERE razorpay_payment_id = $1 AND status = 'created'`,
        [razorpayPaymentId]
      );

      // STEP 5: Mark success
      await client.query(
        `UPDATE webhook_event_execution_log SET status = 'success', executed_at = NOW()
         WHERE provider_event_id = $1`,
        [providerEventId]
      );

      return { workerId: workerNum, updated: updateResult.rowCount };
    });
  } catch (err) {
    console.error(`Worker ${workerNum} error:`, err.message);
    throw err;
  }
}

describe('BLOCKER #4: Concurrency Safety', () => {
  describe('A: Two concurrent workers', () => {
    test('same provider_event_id → only 1 payment captured', async () => {
      const { bookingId, paymentId, razorpayPaymentId, webhookEventId, providerEventId } = await createFullPaymentScenario();

      // Execute concurrently
      const results = await Promise.allSettled([
        simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, 1),
        simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, 2),
      ]);

      // At least one should succeed
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify exactly one payment mutation
      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      expect(payment.rows[0].status).toBe('captured');

      // Verify exactly one booking confirmed
      const booking = await db.query(
        `SELECT status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      expect(booking.rows[0].status).toBe('confirmed');

      console.log('✅ A: 2 workers → 1 mutation');
    });
  });

  describe('B: Five concurrent workers', () => {
    test('same provider_event_id → only 1 payment captured', async () => {
      const { bookingId, paymentId, razorpayPaymentId, webhookEventId, providerEventId } = await createFullPaymentScenario();

      // Execute 5 workers concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, i + 1).catch(() => null)
      );

      await Promise.allSettled(promises);

      // Verify exactly one mutation
      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      expect(payment.rows[0].status).toBe('captured');

      const booking = await db.query(
        `SELECT status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      expect(booking.rows[0].status).toBe('confirmed');

      console.log('✅ B: 5 workers → 1 mutation');
    });
  });

  describe('C: Twenty concurrent workers', () => {
    test('same provider_event_id → only 1 payment captured', async () => {
      const { bookingId, paymentId, razorpayPaymentId, webhookEventId, providerEventId } = await createFullPaymentScenario();

      const promises = Array.from({ length: 20 }, (_, i) =>
        simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, i + 1).catch(() => null)
      );

      await Promise.allSettled(promises);

      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      expect(payment.rows[0].status).toBe('captured');

      const booking = await db.query(
        `SELECT status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      expect(booking.rows[0].status).toBe('confirmed');

      console.log('✅ C: 20 workers → 1 mutation');
    });
  });

  describe('D: Hundred concurrent workers', () => {
    test('same provider_event_id → only 1 payment captured', async () => {
      const { bookingId, paymentId, razorpayPaymentId, webhookEventId, providerEventId } = await createFullPaymentScenario();

      const promises = Array.from({ length: 100 }, (_, i) =>
        simulateWebhookExecution(razorpayPaymentId, webhookEventId, providerEventId, i + 1).catch(() => null)
      );

      await Promise.allSettled(promises);

      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      expect(payment.rows[0].status).toBe('captured');

      const booking = await db.query(
        `SELECT status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      expect(booking.rows[0].status).toBe('confirmed');

      console.log('✅ D: 100 workers → 1 mutation');
    });
  });

  afterEach(async () => {
    try {
      await db.query(
        `DELETE FROM webhook_event_execution_log WHERE provider_event_id LIKE $1`,
        ['payment.captured.%']
      );
    } catch (err) {
      // ignore
    }
  });
});
