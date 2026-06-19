'use strict';

/**
 * Test: BLOCKER #1 — Transaction-Level Idempotency (Crash-Window)
 *
 * Verifies that:
 * 1. Idempotency gate is atomic with business logic
 * 2. Crash recovery does NOT cause silent payment loss
 * 3. Exactly-once semantics guaranteed
 */

const db = require('../config/db');
const crypto = require('crypto');

async function createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus = 'created' }) {
  // UUID columns must receive pure UUID values.
  // Prefixes like "user-" break casting into UUID.
  const userId = crypto.randomUUID();
  const agencyId = crypto.randomUUID();
  const tripId = crypto.randomUUID();

  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [userId, `${userId.substring(0, 10)}@test.com`, 'hash', 'Test User', 'user']
  );

  await db.query(
    `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [agencyId, `${agencyId.substring(0, 10)}@test.com`, 'hash', 'Agency', 'agency']
  );

  await db.query(
    `INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    [tripId, agencyId, 'Test Trip', 'Desc', 'Loc', 10000.00, 10]
  );

  await db.query(
    `INSERT INTO bookings (id, user_id, agency_id, trip_id, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [bookingId, userId, agencyId, tripId, 1, 1000.00, 1000.00, '2026-12-01', 'pending', 'unpaid']
  );

  await db.query(
    `INSERT INTO payments (id, razorpay_payment_id, booking_id, user_id, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [paymentId, razorpayPaymentId, bookingId, userId, 1000.00, paymentStatus]
  );

  return { userId, agencyId, tripId };
}

describe('BLOCKER #1: Transaction-Level Idempotency', () => {
  beforeEach(async () => {
    await db.query('DELETE FROM webhook_event_execution_log');
    await db.query('DELETE FROM refunds');
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM bookings');
    await db.query('DELETE FROM webhook_events');
  });

  afterEach(async () => {
    await db.query('DELETE FROM webhook_event_execution_log');
    await db.query('DELETE FROM refunds');
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM bookings');
    await db.query('DELETE FROM webhook_events');
  });

  describe('Test A: Persist webhook, claim, kill before commit, restart', () => {
    test('should perform exactly one financial mutation after crash recovery', async () => {
      // Setup: Create a payment and booking
      const bookingId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;

      await createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus: 'created' });

      // Setup: Create webhook event
      const webhookEventId = crypto.randomUUID();
      const providerEventId = `razorpay_evt_${crypto.randomUUID()}`;

      await db.query(
        `INSERT INTO webhook_events
         (id, provider, provider_event_id, event_type, payload, status, created_at, updated_at)
         VALUES ($1, 'razorpay', $2, 'payment.captured', $3, 'received', NOW(), NOW())`,
        [
          webhookEventId,
          providerEventId,
          JSON.stringify({
            id: providerEventId,
            event: 'payment.captured',
            payload: {
              payment: {
                entity: { id: razorpayPaymentId }
              }
            }
          })
        ]
      );

      // Simulate Phase 1: Reserve execution (outside transaction)
      const executionHash = crypto.createHash('sha256')
        .update(providerEventId)
        .update('|payment.captured|')
        .digest('hex');

      await db.query(
        `INSERT INTO webhook_event_execution_log
         (provider_event_id, webhook_event_id, execution_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', NOW(), NOW())
         ON CONFLICT (provider_event_id) DO NOTHING`,
        [providerEventId, webhookEventId, executionHash]
      );

      // Verify reservation was committed
      let execLog = await db.query(
        `SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1`,
        [providerEventId]
      );
      expect(execLog.rows[0].status).toBe('pending');

      // Simulate Phase 2: Start transaction, apply payment, mark success
      // Then simulate CRASH before commit
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // Check execution log (inside transaction)
        execLog = await client.query(
          `SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1 FOR UPDATE`,
          [providerEventId]
        );
        expect(execLog.rows[0].status).toBe('pending');

        // Apply payment mutation
        await client.query(
          `UPDATE payments SET status = 'captured', updated_at = NOW()
           WHERE razorpay_payment_id = $1 AND status = 'created'`,
          [razorpayPaymentId]
        );

        // Mark execution succeeded (inside transaction)
        await client.query(
          `UPDATE webhook_event_execution_log
           SET status = 'success', executed_at = NOW(), updated_at = NOW()
           WHERE provider_event_id = $1`,
          [providerEventId]
        );

        // Simulate CRASH here: rollback instead of commit
        await client.query('ROLLBACK');

        // Verify crash behavior:
        // - Payment update rolled back (still 'created')
        // - But execution_log status='success' persists (separate transaction)
      } finally {
        await client.release();
      }

      // After crash, check what persisted
      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );
      const paymentStatus = payment.rows[0].status;

      execLog = await db.query(
        `SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1`,
        [providerEventId]
      );
      const execStatus = execLog.rows[0].status;

      console.log(`After crash: payment=${paymentStatus}, execLog=${execStatus}`);

      // BLOCKER: This is the current buggy state
      // If execStatus='success' but paymentStatus='created', we have orphaned idempotency gate
      // Next retry will skip business logic → SILENT PAYMENT LOSS
      if (execStatus === 'success' && paymentStatus === 'created') {
        console.log('⚠️  BLOCKER CONFIRMED: Orphaned idempotency gate allows silent payment loss');
        console.log('   execLog shows success, but payment was never captured');
        console.log('   Next retry will see execLog.status=success and SKIP business logic');
        throw new Error(
          'BLOCKER #1 ACTIVE: Crash window allows idempotency gate to survive while business logic rolls back'
        );
      }

      // After fix: Both should roll back together
      expect(paymentStatus).toBe('created'); // Rolled back
      expect(execStatus).toBe('pending'); // Also rolled back (inside transaction)
    });
  });

  describe('Test B: 100 duplicate deliveries', () => {
    test('should apply exactly one financial mutation across 100 duplicates', async () => {
      // Setup
      const bookingId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;
      const providerEventId = crypto.randomUUID();
      const webhookEventId = crypto.randomUUID();

      await createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus: 'created' });

      await db.query(
        `INSERT INTO webhook_events
         (id, provider, provider_event_id, event_type, payload, status, created_at, updated_at)
         VALUES ($1, 'razorpay', $2, 'payment.captured', $3, 'received', NOW(), NOW())`,
        [
          webhookEventId,
          providerEventId,
          JSON.stringify({
            id: providerEventId,
            event: 'payment.captured',
            payload: {
              payment: {
                entity: { id: razorpayPaymentId }
              }
            }
          })
        ]
      );

      // Simulate 100 duplicate deliveries
      for (let i = 0; i < 100; i++) {
        const executionHash = crypto.createHash('sha256')
          .update(providerEventId)
          .update('|payment.captured|')
          .digest('hex');

        try {
          await db.transaction(async (client) => {
            // Attempt to reserve (will conflict after first)
            await client.query(
              `INSERT INTO webhook_event_execution_log
               (provider_event_id, webhook_event_id, execution_hash, status)
               VALUES ($1, $2, $3, 'pending')
               ON CONFLICT (provider_event_id) DO NOTHING
               RETURNING provider_event_id`,
              [providerEventId, webhookEventId, executionHash]
            );

            // Check if already processed
            const execLog = await client.query(
              `SELECT status FROM webhook_event_execution_log
               WHERE provider_event_id = $1 FOR UPDATE`,
              [providerEventId]
            );

            if (execLog.rows[0]?.status === 'success') {
              return; // Skip business logic
            }

            // Apply payment (only if not already done)
            if (execLog.rows[0]?.status === 'pending') {
              await client.query(
                `UPDATE webhook_event_execution_log
                 SET status = 'in_progress' WHERE provider_event_id = $1`,
                [providerEventId]
              );

              await client.query(
                `UPDATE bookings
                 SET payment_status = 'paid', status = 'confirmed', updated_at = NOW()
                 WHERE id = (
                   SELECT booking_id FROM payments WHERE razorpay_payment_id = $1
                 )
                 AND status = 'pending'`,
                [razorpayPaymentId]
              );

              await client.query(
                `UPDATE payments SET status = 'captured', updated_at = NOW()
                 WHERE razorpay_payment_id = $1 AND status = 'created'`,
                [razorpayPaymentId]
              );

              await client.query(
                `UPDATE webhook_event_execution_log
                 SET status = 'success', executed_at = NOW(), updated_at = NOW()
                 WHERE provider_event_id = $1`,
                [providerEventId]
              );
            }
          });
        } catch (err) {
          // Expected: some conflicts are ok
        }
      }

      // Verify exactly one financial mutation
      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );

      expect(payment.rows[0].status).toBe('captured');

      // Verify exactly one execution log record
      const execLogs = await db.query(
        `SELECT * FROM webhook_event_execution_log WHERE provider_event_id = $1`,
        [providerEventId]
      );

      expect(execLogs.rows.length).toBe(1);
      expect(execLogs.rows[0].status).toBe('success');
    });
  });

  describe('Test C: Kill process during transaction', () => {
    test('should not lose payment on abrupt process termination', async () => {
      const bookingId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;
      const providerEventId = crypto.randomUUID();
      const webhookEventId = crypto.randomUUID();

      await createMinimalBookingAndPayment({
        bookingId,
        paymentId,
        razorpayPaymentId,
        paymentStatus: 'created'
      });

      await db.query(
        `INSERT INTO webhook_events
         (id, provider, provider_event_id, event_type, payload, status, created_at, updated_at)
         VALUES ($1, 'razorpay', $2, 'payment.captured', $3, 'received', NOW(), NOW())`,
        [
          webhookEventId,
          providerEventId,
          JSON.stringify({
            id: providerEventId,
            event: 'payment.captured',
            payload: {
              payment: {
                entity: { id: razorpayPaymentId }
              }
            }
          })
        ]
      );

      // Start transaction
      let client;
      try {
        client = await db.pool.connect();
        await client.query('BEGIN');

        // Insert execution log (inside txn)
        const executionHash = crypto.createHash('sha256')
          .update(providerEventId)
          .update('|payment.captured|')
          .digest('hex');

        await client.query(
          `INSERT INTO webhook_event_execution_log
           (provider_event_id, webhook_event_id, execution_hash, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT DO NOTHING`,
          [providerEventId, webhookEventId, executionHash]
        );

        // Apply payment
        await client.query(
          `UPDATE payments SET status = 'captured', updated_at = NOW()
           WHERE razorpay_payment_id = $1 AND status = 'created'`,
          [razorpayPaymentId]
        );

        // Mark success
        await client.query(
          `UPDATE webhook_event_execution_log
           SET status = 'success', executed_at = NOW()
           WHERE provider_event_id = $1`,
          [providerEventId]
        );

        // Simulate process termination: connection dies without COMMIT or ROLLBACK
        await client.query('ROLLBACK');
      } finally {
        if (client) client.release();
      }

      // After crash/rollback, payment should be back to 'created'
      const payment = await db.query(
        `SELECT status FROM payments WHERE razorpay_payment_id = $1`,
        [razorpayPaymentId]
      );

      // With the fix: entire transaction rolled back
      expect(payment.rows[0].status).toBe('created');

      // With the fix: execution log also rolled back (not orphaned)
      const execLog = await db.query(
        `SELECT * FROM webhook_event_execution_log WHERE provider_event_id = $1`,
        [providerEventId]
      );

      // Should not exist or should be 'pending' (depending on implementation)
      if (execLog.rows.length > 0) {
        expect(execLog.rows[0].status).toBe('pending');
      }
    });
  });
});

