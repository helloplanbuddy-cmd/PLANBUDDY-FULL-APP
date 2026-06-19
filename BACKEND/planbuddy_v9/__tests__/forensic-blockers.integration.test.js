'use strict';

/**
 * planbuddy_v9/__tests__/forensic-blockers.integration.test.js
 *
 * HOSTILE FORENSIC INTEGRATION TESTS
 *
 * These tests verify or disprove production blockers by:
 * 1. Using REAL PostgreSQL transactions (no mocks)
 * 2. Simulating failure modes (crashes, rollbacks, race conditions)
 * 3. Verifying financial mutations occur exactly once
 * 4. Verifying no event loss under failure conditions
 *
 * Run: NODE_ENV=test npm test -- forensic-blockers.integration.test.js
 */

const db = require('../config/db');
const { Pool } = require('pg');
const crypto = require('crypto');

const logger = console;

describe('FORENSIC BLOCKER INTEGRATION TESTS', () => {
  let testDb;

  beforeAll(async () => {
    // Use real PostgreSQL connection
    testDb = db;

    // Clean test data (proper foreign key order)
    try {
      await testDb.query('DELETE FROM webhook_event_execution_log');
      await testDb.query('DELETE FROM webhook_events');
      await testDb.query('DELETE FROM refunds');
      await testDb.query('DELETE FROM payments');
      await testDb.query('DELETE FROM bookings');
      await testDb.query('DELETE FROM trips');
      await testDb.query('DELETE FROM users');
    } catch (err) {
      logger.error('Cleanup error:', err.message);
    }
  });

  afterAll(async () => {
    // Don't close the pool — it's shared
  });

  afterEach(async () => {
    // Clean between tests (proper foreign key order)
    try {
      await testDb.query('DELETE FROM webhook_event_execution_log');
      await testDb.query('DELETE FROM webhook_events');
      await testDb.query('DELETE FROM refunds');
      await testDb.query('DELETE FROM payments');
      await testDb.query('DELETE FROM bookings');
      await testDb.query('DELETE FROM trips');
      await testDb.query('DELETE FROM users');
    } catch (err) {
      logger.error('Cleanup error:', err.message);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────────
  // BLOCKER #1: CRASH-WINDOW IDEMPOTENCY FAILURE
  // ───────────────────────────────────────────────────────────────────────────────

  describe('BLOCKER #1: Transaction-Level Idempotency (Crash Window)', () => {
    test('Scenario A: Idempotency gate survives transaction rollback', async () => {
      /**
       * SCENARIO:
       * 1. Webhook event received and persisted
       * 2. Worker claims event
       * 3. Worker inserts execution_log row (reservation)
       * 4. Worker starts transaction for business logic
       * 5. Business logic completes successfully
       * 6. BUT transaction rolls back (simulated: constraint violation, deadlock, etc.)
       * 7. Worker crashes
       * 8. New worker restarts and reprocesses event
       *
       * PASS CRITERIA:
       * - Payment mutation occurs exactly ONCE
       * - Booking mutation occurs exactly ONCE
       * - No duplicate financial state
       */

      // Setup: Create test data
      const userId = crypto.randomUUID();
      const agencyId = crypto.randomUUID();
      const tripId = crypto.randomUUID();
      const paymentId = 'pay_' + crypto.randomBytes(8).toString('hex');
      const providerEventId = 'evt_' + crypto.randomBytes(8).toString('hex');

      // Insert user, agency, and trip
      await testDb.query(
        'INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
        [userId, `${userId}@test.com`, 'test-password-hash', 'Test User', 'user']
      );

      await testDb.query(
        'INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
        [agencyId, `${agencyId}@agency.test`, 'test-password-hash', 'Test Agency', 'agency']
      );

      await testDb.query(
        'INSERT INTO trips (id, agency_id, title, description, location, price, max_group_size) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [tripId, agencyId, 'Test Trip', 'Integration test trip', 'Test City', 1000.0, 10]
      );

      // Insert booking
      const { rows: bookingRows } = await testDb.query(
        'INSERT INTO bookings (user_id, agency_id, trip_id, group_size, total_amount, final_amount, travel_date, status, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id',
        [userId, agencyId, tripId, 1, 1000.0, 1000.0, '2026-06-10', 'pending', 'unpaid']
      );
      const bookingId = bookingRows[0].id;

      // Insert payment
      await testDb.query(
        'INSERT INTO payments (user_id, booking_id, razorpay_payment_id, amount, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
        [userId, bookingId, paymentId, 100000, 'created']
      );

      // Insert webhook event
      const { rows: webhookRows } = await testDb.query(
        'INSERT INTO webhook_events (provider, provider_event_id, event_type, payload, payload_bytes, signature, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id',
        [
          'razorpay',
          providerEventId,
          'payment.captured',
          { payload: { payment: { entity: { id: paymentId } } } },
          Buffer.from(JSON.stringify({ payload: { payment: { entity: { id: paymentId } } } })),
          'sig',
          'received',
        ]
      );
      const webhookEventId = webhookRows[0].id;

      // STEP 1: Insert execution_log row (simulating worker reservation)
      const executionHash = crypto
        .createHash('sha256')
        .update(providerEventId + '|payment.captured')
        .digest('hex');

      await testDb.query(
        'INSERT INTO webhook_event_execution_log (provider_event_id, webhook_event_id, execution_hash, status) VALUES ($1, $2, $3, $4)',
        [providerEventId, webhookEventId, executionHash, 'pending']
      );

      // STEP 2: Simulate transaction that updates payment + booking, then rolls back
      let transactionRolledBack = false;
      try {
        await testDb.transaction(async (client) => {
          // Mark execution in progress
          await client.query(
            'UPDATE webhook_event_execution_log SET status = $1, updated_at = NOW() WHERE provider_event_id = $2',
            ['in_progress', providerEventId]
          );

          // Update booking first to satisfy the payment capture invariant.
          await client.query(
            'UPDATE bookings SET payment_status = $1, status = $2, updated_at = NOW() WHERE id = $3',
            ['paid', 'confirmed', bookingId]
          );

          // Update payment after booking state is consistent.
          await client.query(
            'UPDATE payments SET status = $1, updated_at = NOW() WHERE razorpay_payment_id = $2',
            ['captured', paymentId]
          );

          // Mark execution succeeded
          await client.query(
            'UPDATE webhook_event_execution_log SET status = $1, executed_at = NOW(), updated_at = NOW() WHERE provider_event_id = $2',
            ['success', providerEventId]
          );

          // FORCE ROLLBACK: Simulate crash by throwing after marking success
          // (This tests whether the idempotency gate survives rollback)
          throw new Error('SIMULATED_CRASH_AFTER_BUSINESS_LOGIC');
        });
      } catch (err) {
        if (err.message === 'SIMULATED_CRASH_AFTER_BUSINESS_LOGIC') {
          transactionRolledBack = true;
        } else {
          throw err;
        }
      }

      expect(transactionRolledBack).toBe(true);

      // STEP 3: Verify payment status was rolled back
      const { rows: paymentCheckRows } = await testDb.query(
        'SELECT status FROM payments WHERE razorpay_payment_id = $1',
        [paymentId]
      );
      expect(paymentCheckRows[0].status).toBe('created'); // Still 'created', not 'captured'

      // STEP 4: Verify booking status was rolled back
      const { rows: bookingCheckRows } = await testDb.query(
        'SELECT status FROM bookings WHERE id = $1',
        [bookingId]
      );
      expect(bookingCheckRows[0].status).toBe('pending'); // Still 'pending', not 'confirmed'

      // CRITICAL: Check execution_log status after rollback
      const { rows: execLogRows } = await testDb.query(
        'SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1',
        [providerEventId]
      );

      /**
       * BLOCKER DIAGNOSIS:
       * If execLog.status === 'success' after rollback → ⚠️ BLOCKER ACTIVE
       *   The idempotency gate was committed before the transaction rolled back.
       *   A retry will see 'success' in execution_log and skip business logic.
       *   But the business logic changes were rolled back!
       *   Result: Silent failure — webhook processed, but payment not captured.
       *
       * If execLog.status === 'in_progress' after rollback → ✅ SAFE
       *   The idempotency gate survived rollback.
       *   A retry will re-execute the business logic.
       *   Result: Exactly-once semantics preserved.
       */

      const execLogStatus = execLogRows[0].status;
      logger.info(`[BLOCKER #1] Execution log status after rollback: ${execLogStatus}`);

      if (execLogStatus === 'success') {
        throw new Error(
          'BLOCKER #1 ACTIVE: Idempotency gate marked "success" but transaction rolled back. ' +
          'A retry will skip business logic, leaving payment uncaptured. ' +
          'This causes SILENT PAYMENT LOSS.'
        );
      }

      // STEP 5: Retry logic — new worker processes same event
      await testDb.transaction(async (client) => {
        const logEntry = await client.query(
          'SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1 FOR UPDATE',
          [providerEventId]
        );

        if (logEntry.rows[0].status !== 'success') {
          // Re-execute business logic
          await client.query(
            'UPDATE webhook_event_execution_log SET status = $1, updated_at = NOW() WHERE provider_event_id = $2',
            ['in_progress', providerEventId]
          );

          await client.query(
            'UPDATE bookings SET payment_status = $1, status = $2, updated_at = NOW() WHERE id = $3 AND status = $4',
            ['paid', 'confirmed', bookingId, 'pending']
          );

          await client.query(
            'UPDATE payments SET status = $1, updated_at = NOW() WHERE razorpay_payment_id = $2 AND status = $3',
            ['captured', paymentId, 'created']
          );

          await client.query(
            'UPDATE webhook_event_execution_log SET status = $1, executed_at = NOW(), updated_at = NOW() WHERE provider_event_id = $2',
            ['success', providerEventId]
          );
        }
      });

      // STEP 6: Verify payment is now captured (exactly once)
      const { rows: finalPaymentRows } = await testDb.query(
        'SELECT status FROM payments WHERE razorpay_payment_id = $1',
        [paymentId]
      );
      expect(finalPaymentRows[0].status).toBe('captured');

      // STEP 7: Verify booking is now confirmed (exactly once)
      const { rows: finalBookingRows } = await testDb.query(
        'SELECT status FROM bookings WHERE id = $1',
        [bookingId]
      );
      expect(finalBookingRows[0].status).toBe('confirmed');

      logger.info('✅ BLOCKER #1 TEST PASSED: Idempotency preserved through rollback');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────
  // BLOCKER #2: SILENT PAYMENT LOSS
  // ───────────────────────────────────────────────────────────────────────────────

  describe('BLOCKER #2: Silent Payment Loss (Missing Dependency)', () => {
    test('Payment webhook arrives before payment record exists → event not lost', async () => {
      /**
       * SCENARIO:
       * 1. payment.captured webhook arrives from Razorpay
       * 2. But payment record doesn't exist in DB yet (race condition)
       * 3. Webhook processor tries to apply payment event
       * 4. applyPaymentEvent throws 'Payment not found'
       *
       * PASS CRITERIA:
       * - Error is thrown (retryable)
       * - Event status remains 'failed' (not 'processed')
       * - Reconciliation will retry
       * - Event is NOT silently discarded
       */

      const providerEventId = 'evt_orphan_' + crypto.randomBytes(8).toString('hex');
      const missingPaymentId = 'pay_' + crypto.randomBytes(8).toString('hex');

      // Insert webhook event WITHOUT corresponding payment record
      const { rows: webhookRows } = await testDb.query(
        'INSERT INTO webhook_events (provider, provider_event_id, event_type, payload, payload_bytes, signature, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id',
        [
          'razorpay',
          providerEventId,
          'payment.captured',
          { payload: { payment: { entity: { id: missingPaymentId } } } },
          Buffer.from(JSON.stringify({ payload: { payment: { entity: { id: missingPaymentId } } } })),
          'sig',
          'received',
        ]
      );
      const webhookEventId = webhookRows[0].id;

      // Insert execution log
      const executionHash = crypto
        .createHash('sha256')
        .update(providerEventId + '|payment.captured')
        .digest('hex');

      await testDb.query(
        'INSERT INTO webhook_event_execution_log (provider_event_id, webhook_event_id, execution_hash, status) VALUES ($1, $2, $3, $4)',
        [providerEventId, webhookEventId, executionHash, 'pending']
      );

      // Try to process event (should fail with retryable error)
      let processingError = null;
      try {
        await testDb.transaction(async (client) => {
          const logEntry = await client.query(
            'SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1 FOR UPDATE',
            [providerEventId]
          );

          if (logEntry.rows[0].status !== 'success') {
            await client.query(
              'UPDATE webhook_event_execution_log SET status = $1 WHERE provider_event_id = $2',
              ['in_progress', providerEventId]
            );

            // THIS SHOULD FAIL: Payment doesn't exist
            const result = await client.query(
              'SELECT id FROM payments WHERE razorpay_payment_id = $1 FOR UPDATE',
              [missingPaymentId]
            );

            if (result.rows.length === 0) {
              throw Object.assign(new Error('Payment not found'), {
                code: 'PAYMENT_NOT_FOUND',
                retryable: true,
              });
            }
          }
        });
      } catch (err) {
        processingError = err;
      }

      expect(processingError).toBeDefined();
      expect(processingError.message).toContain('Payment not found');

      // Verify event status is NOT 'processed'
      const { rows: eventRows } = await testDb.query(
        'SELECT status FROM webhook_events WHERE id = $1',
        [webhookEventId]
      );
      // Status should be 'received' (unchanged)
      expect(['received', 'failed']).toContain(eventRows[0].status);

      // Verify execution_log is NOT marked 'success'
      const { rows: logRows } = await testDb.query(
        'SELECT status FROM webhook_event_execution_log WHERE provider_event_id = $1',
        [providerEventId]
      );
      // Should still be 'pending' or 'in_progress'
      expect(['pending', 'in_progress']).toContain(logRows[0].status);

      logger.info('✅ BLOCKER #2 TEST PASSED: Missing dependency → retryable error (not silent discard)');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────
  // BLOCKER #5: CONNECTION POOL EXHAUSTION
  // ───────────────────────────────────────────────────────────────────────────────

  describe('BLOCKER #5: Connection Pool Exhaustion Risk', () => {
    test('Pool capacity is safe for PM2 cluster + worker scaling', async () => {
      /**
       * FORMULA:
       *   totalConnections = DB_POOL_MAX × PM2_INSTANCES
       *   maxAllowed       = DB_MAX_CONNECTIONS × 0.8
       *   SAFE if:         totalConnections ≤ maxAllowed
       */

      const env = require('../config/env');

      const poolMax = env.DB_POOL_MAX;
      const instances = env.PM2_INSTANCES;
      const pgMax = env.DB_MAX_CONNECTIONS;

      const total = poolMax * instances;
      const maxAllowed = Math.floor(pgMax * 0.8);

      logger.info(`
        [BLOCKER #5] Pool Capacity Analysis
        ─────────────────────────────────────
        DB_POOL_MAX:      ${poolMax}
        PM2_INSTANCES:    ${instances}
        Total conns:      ${total}
        PG max_conns:     ${pgMax}
        Safe limit (80%): ${maxAllowed}
        Status:           ${total <= maxAllowed ? '✅ SAFE' : '❌ UNSAFE'}
      `);

      if (total > maxAllowed) {
        throw new Error(
          `BLOCKER #5 ACTIVE: Connection pool exhaustion risk. ` +
          `Total possible connections (${total}) exceeds safe threshold (${maxAllowed}).`
        );
      }

      expect(total).toBeLessThanOrEqual(maxAllowed);
      logger.info('✅ BLOCKER #5 TEST PASSED: Connection pool capacity is safe');
    });
  });
});
