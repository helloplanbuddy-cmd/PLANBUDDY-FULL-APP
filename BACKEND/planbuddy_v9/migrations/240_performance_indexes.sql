-- ============================================================================
-- Migration: 240_performance_indexes.sql
-- Purpose: Add missing indexes identified in production audit
-- Evidence: users.email queried on EVERY login/registration without index
--           bookings.user_id used in WHERE clauses
--           payments.razorpay_payment_id queried in webhook processing
--           idempotency_keys.key already indexed (ON CONFLICT)
-- Risk: LOW — CONCURRENTLY creates indexes without table locks
-- Rollback: See migrations/rollback/down_240_performance_indexes.sql
-- ============================================================================

-- NOTE:
-- This migration previously used CREATE INDEX CONCURRENTLY inside a transaction
-- (it was wrapped in BEGIN/COMMIT). PostgreSQL forbids CONCURRENTLY in a
-- transaction block.
--
-- Production-safe fix: remove the transaction wrapper so each CREATE INDEX
-- executes as its own standalone statement.

-- users.email — used on login, registration, forgot-password
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users (email);

-- bookings.user_id — used in /api/v1/bookings and cancellation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_user_id
  ON bookings (user_id);

-- bookings.trip_id — used in availability queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_trip_id
  ON bookings (trip_id);

-- Composite index for booking listing with status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_user_status_created
  ON bookings (user_id, status, created_at DESC);

-- bookings.travel_date — used in availability and reconciliation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_travel_date
  ON bookings (travel_date);

-- payments.razorpay_payment_id — webhook lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_razorpay_payment_id
  ON payments (razorpay_payment_id);

-- payments.booking_id — JOIN with bookings
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_booking_id
  ON payments (booking_id);

-- payments.user_id — used in status endpoint ownership check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_id
  ON payments (user_id);

-- Composite index for payment status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_booking_status
  ON payments (booking_id, status);

-- token_blacklist.jti — revocation check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_jti
  ON token_blacklist (jti);

-- token_blacklist.user_id — revoke-all sessions lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_user_id
  ON token_blacklist (user_id);

-- token_blacklist.expires_at — cleanup job index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_blacklist_expires_at
  ON token_blacklist (expires_at);

-- idempotency_keys.user_id — scoped lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_keys_user_id
  ON idempotency_keys (user_id);

-- idempotency_keys.expires_at — cleanup job
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_keys_expires_at
  ON idempotency_keys (expires_at);

-- audit_log.user_id — audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_id
  ON audit_log (user_id);

-- audit_log.created_at — time-range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at DESC);

-- webhook_events.provider_event_id — webhook deduplication
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_provider_event_id
  ON webhook_events (provider_event_id);

-- password_reset_tokens.user_id — token lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

-- refund-related lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_booking_id
  ON refunds (booking_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_razorpay_refund_id
  ON refunds (razorpay_refund_id);

-- ANALYZE to update query planner statistics
ANALYZE users;
ANALYZE bookings;
ANALYZE payments;
ANALYZE token_blacklist;
ANALYZE idempotency_keys;
ANALYZE audit_log;
ANALYZE webhook_events;
ANALYZE password_reset_tokens;
ANALYZE refunds;
