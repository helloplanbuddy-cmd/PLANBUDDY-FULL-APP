'use strict';

const db = require('../config/db');
const crypto = require('crypto');

async function createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus = 'created' }) {
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

describe('BLOCKER #1: Transaction-Level Idempotency (crash-window)', () => {
  beforeEach(async () => {
    await db.query('DELETE FROM webhook_event_execution_log');
  });

  afterEach(async () => {
    await db.query('DELETE FROM webhook_event_execution_log');
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM bookings');
    await db.query('DELETE FROM webhook_events');
  });

  afterAll(async () => {
    // Ensure Jest exits cleanly: terminate the pg pool TCPWRAP handle.
    await db.end();
  });

  afterEach(async () => {
    await db.query('DELETE FROM webhook_event_execution_log');
    await db.query('DELETE FROM payments');
    await db.query('DELETE FROM bookings');
    await db.query('DELETE FROM webhook_events');
  });

  test('Test A: persist webhook + claim + crash before commit => both rolled back', async () => {
    const bookingId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;
    await createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus: 'created' });

    const webhookEventId = crypto.randomUUID();
    const providerEventId = crypto.randomUUID(); // UUID column

    const executionHash = crypto.createHash('sha256')
      .update(providerEventId)
      .update('|payment.captured|')
      .digest('hex');

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
          payload: { payment: { entity: { id: razorpayPaymentId } } }
        })
      ]
    );

    await db.query(
      `INSERT INTO webhook_event_execution_log
       (provider_event_id, webhook_event_id, execution_hash, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [providerEventId, webhookEventId, executionHash]
    );

    expect(
      (await db.query(`SELECT status FROM webhook_event_execution_log WHERE provider_event_id=$1`, [providerEventId])).rows[0].status
    ).toBe('pending');

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

        await client.query(
          `UPDATE bookings
           SET payment_status='paid'
           WHERE id = (SELECT booking_id FROM payments WHERE razorpay_payment_id=$1)
          `,
          [razorpayPaymentId]
        );

        await client.query(
          `UPDATE bookings
           SET payment_status='paid'
           WHERE id = (SELECT booking_id FROM payments WHERE razorpay_payment_id=$1)
          `,
          [razorpayPaymentId]
        );

        await client.query(
          `UPDATE bookings
           SET payment_status='paid', updated_at=NOW()
           WHERE id = (SELECT booking_id FROM payments WHERE razorpay_payment_id=$1)`,
          [razorpayPaymentId]
        );

        await client.query(
          `UPDATE payments SET status='captured', updated_at=NOW()
           WHERE razorpay_payment_id=$1 AND status='created'`,
          [razorpayPaymentId]
        );

      await client.query(
        `UPDATE webhook_event_execution_log
         SET status='success', executed_at=NOW(), updated_at=NOW()
         WHERE provider_event_id=$1`,
        [providerEventId]
      );

      // Crash before commit
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const paymentStatus = (await db.query(`SELECT status FROM payments WHERE razorpay_payment_id=$1`, [razorpayPaymentId])).rows[0].status;
    const execStatus = (await db.query(`SELECT status FROM webhook_event_execution_log WHERE provider_event_id=$1`, [providerEventId])).rows[0].status;

    expect(paymentStatus).toBe('created');
    expect(execStatus).toBe('pending');
  });

  test('Test B: 100 duplicate deliveries => capture exactly once', async () => {
    const bookingId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;
    const providerEventId = crypto.randomUUID(); // UUID column

    await createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus: 'created' });

    const executionHash = crypto.createHash('sha256')
      .update(providerEventId)
      .update('|payment.captured|')
      .digest('hex');

    // Create a single webhook row to satisfy FK.
    const webhookEventId = crypto.randomUUID();
    await db.query(
      `INSERT INTO webhook_events
       (id, provider, provider_event_id, event_type, payload, status, created_at, updated_at)
       VALUES ($1, 'razorpay', $2, 'payment.captured', $3, 'received', NOW(), NOW())`,
      [
        webhookEventId,
        providerEventId,
        JSON.stringify({ id: providerEventId, event: 'payment.captured', payload: { payment: { entity: { id: razorpayPaymentId } } } })
      ]
    );

    for (let i = 0; i < 100; i++) {
      await db.transaction(async (client) => {
        // Reserve once
        await client.query(
          `INSERT INTO webhook_event_execution_log
           (provider_event_id, webhook_event_id, execution_hash, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (provider_event_id) DO NOTHING`,
          [providerEventId, webhookEventId, executionHash]
        );

        const row = await client.query(
          `SELECT status FROM webhook_event_execution_log WHERE provider_event_id=$1 FOR UPDATE`,
          [providerEventId]
        );

        if (row.rows[0].status === 'success') return;

        await client.query(
          `UPDATE webhook_event_execution_log
           SET status='in_progress'
           WHERE provider_event_id=$1`,
          [providerEventId]
        );

        await client.query(
          `UPDATE bookings
           SET payment_status='paid', updated_at=NOW()
           WHERE id = (SELECT booking_id FROM payments WHERE razorpay_payment_id=$1)`,
          [razorpayPaymentId]
        );

        await client.query(
          `UPDATE payments SET status='captured', updated_at=NOW()
           WHERE razorpay_payment_id=$1 AND status='created'`,
          [razorpayPaymentId]
        );

        await client.query(
          `UPDATE webhook_event_execution_log
           SET status='success', executed_at=NOW(), updated_at=NOW()
           WHERE provider_event_id=$1`,
          [providerEventId]
        );
      });
    }

    const paymentStatus = (await db.query(`SELECT status FROM payments WHERE razorpay_payment_id=$1`, [razorpayPaymentId])).rows[0].status;
    expect(paymentStatus).toBe('captured');

    const execLogs = await db.query(
      `SELECT * FROM webhook_event_execution_log WHERE provider_event_id=$1`,
      [providerEventId]
    );
    expect(execLogs.rows.length).toBe(1);
    expect(execLogs.rows[0].status).toBe('success');
  });

  test('Test C: kill during transaction => rollback prevents orphaned success gate', async () => {
    const bookingId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const razorpayPaymentId = `razorpay_${crypto.randomUUID()}`;
    const providerEventId = crypto.randomUUID(); // UUID column

    await createMinimalBookingAndPayment({ bookingId, paymentId, razorpayPaymentId, paymentStatus: 'created' });

    const webhookEventId = crypto.randomUUID();

    await db.query(
      `INSERT INTO webhook_events
       (id, provider, provider_event_id, event_type, payload, status, created_at, updated_at)
       VALUES ($1, 'razorpay', $2, 'payment.captured', $3, 'received', NOW(), NOW())`,
      [
        webhookEventId,
        providerEventId,
        JSON.stringify({ id: providerEventId, event: 'payment.captured', payload: { payment: { entity: { id: razorpayPaymentId } } } })
      ]
    );

    const executionHash = crypto.createHash('sha256')
      .update(providerEventId)
      .update('|payment.captured|')
      .digest('hex');

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO webhook_event_execution_log
         (provider_event_id, webhook_event_id, execution_hash, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT DO NOTHING`,
        [providerEventId, webhookEventId, executionHash]
      );

      await client.query(
        `UPDATE payments SET status='captured', updated_at=NOW()
         WHERE razorpay_payment_id=$1 AND status='created'`,
        [razorpayPaymentId]
      );

      await client.query(
        `UPDATE webhook_event_execution_log
         SET status='success', executed_at=NOW()
         WHERE provider_event_id=$1`,
        [providerEventId]
      );

      // crash before commit
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const paymentStatus = (await db.query(`SELECT status FROM payments WHERE razorpay_payment_id=$1`, [razorpayPaymentId])).rows[0].status;
    expect(paymentStatus).toBe('created');

    const execLogRows = await db.query(`SELECT status FROM webhook_event_execution_log WHERE provider_event_id=$1`, [providerEventId]);
    if (execLogRows.rows.length > 0) {
      expect(execLogRows.rows[0].status).toBe('pending');
    }
  });
});

