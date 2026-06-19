-- ──────────────────────────────────────────────────────────────────────
-- PlanBuddy Backend — Hot-Path Index Migration (v250)
-- P1-02 FIX: Add partial / composite indexes for the hottest read paths.
--
-- Background:
--   At 1k+ users we expect:
--     - SELECT FROM bookings  WHERE user_id = $1 AND status = 'pending'   (booking list)
--     - SELECT FROM payments   WHERE user_id = $1 AND status = 'created'    (payment status)
--     - SELECT FROM token_blacklist WHERE user_id = $1 ...                   (revocation check)
--   Existing single-column indexes on user_id are not selective enough
--   when most rows for a user are historical (cancelled / completed).
--
-- All CREATE INDEX statements use CONCURRENTLY so they do not block writes.
-- A migration that runs CONCURRENTLY cannot run inside a transaction block,
-- so each statement is its own implicit transaction.
--
-- Apply: psql -f 250_hot_path_indexes.sql $DATABASE_URL
-- Rollback: psql -f migrations/rollback/down_250_hot_path_indexes.sql $DATABASE_URL
-- ──────────────────────────────────────────────────────────────────────

-- bookings: (user_id, status) — booking list + status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_user_status
  ON bookings (user_id, status)
  WHERE deleted_at IS NULL;

-- bookings: (status, travel_date) — trip availability scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_status_travel_date
  ON bookings (status, travel_date)
  WHERE status IN ('pending', 'confirmed');

-- payments: (user_id, status) — payment status + reconciliation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_status
  ON payments (user_id, status);

-- payments: (razorpay_order_id) — webhook lookup (already exists per migration 120; recreate only if missing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_razorpay_order
  ON payments (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- token_blacklist: (user_id, created_at) — fast revocation scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_user_created
  ON token_blacklist (user_id, created_at DESC);

-- webhook_events: (status, last_attempt_at) — DLQ scan + claim batch
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_status_attempt
  ON webhook_events (status, COALESCE(last_attempt_at, created_at))
  WHERE status IN ('received', 'failed')
     OR (status = 'processing' AND lease_expires_at < NOW());

-- payment_integrity_log: (booking_id, created_at DESC) — recent integrity history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_integrity_log_booking
  ON payment_integrity_log (booking_id, created_at DESC);

-- idempotency_keys: (user_id_str, endpoint) — fast key lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_keys_user_endpoint
  ON idempotency_keys (user_id_str, endpoint);

-- trips: (is_active, start_date) — public availability scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_active_start
  ON trips (is_active, start_date)
  WHERE is_active = true;

-- ANALYZE updated tables to refresh planner statistics.
ANALYZE bookings;
ANALYZE payments;
ANALYZE token_blacklist;
ANALYZE webhook_events;
ANALYZE payment_integrity_log;
ANALYZE idempotency_keys;
ANALYZE trips;
