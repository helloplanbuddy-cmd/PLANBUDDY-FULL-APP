-- ──────────────────────────────────────────────────────────────────────
-- PlanBuddy Backend — Hot-Path Index Migration ROLLBACK (v250)
-- Reverses 250_hot_path_indexes.sql
-- ──────────────────────────────────────────────────────────────────────

DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_user_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_status_travel_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_user_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_razorpay_order;
DROP INDEX CONCURRENTLY IF EXISTS idx_token_blacklist_user_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_events_status_attempt;
DROP INDEX CONCURRENTLY IF EXISTS idx_payment_integrity_log_booking;
DROP INDEX CONCURRENTLY IF EXISTS idx_idempotency_keys_user_endpoint;
DROP INDEX CONCURRENTLY IF EXISTS idx_trips_active_start;
