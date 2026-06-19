-- Rollback: down_240_performance_indexes.sql
-- Drops all indexes created by 240_performance_indexes.sql

BEGIN;

DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;
DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_trip_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_user_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_travel_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_razorpay_payment_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_booking_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_payments_booking_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_token_blacklist_jti;
DROP INDEX CONCURRENTLY IF EXISTS idx_token_blacklist_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_token_blacklist_expires_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_idempotency_keys_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_idempotency_keys_expires_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_log_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_log_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_events_provider_event_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_password_reset_tokens_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_refunds_booking_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_refunds_razorpay_refund_id;

COMMIT;