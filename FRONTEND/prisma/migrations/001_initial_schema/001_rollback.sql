-- ============================================================
-- Rollback Migration 001
-- WARNING: Destructive. Only run in emergency rollback.
-- ============================================================
DROP TABLE IF EXISTS "sync_events" CASCADE;
DROP TABLE IF EXISTS "sync_jobs" CASCADE;
DROP TABLE IF EXISTS "ai_usage" CASCADE;
DROP TABLE IF EXISTS "chat_sessions" CASCADE;
DROP TABLE IF EXISTS "memories" CASCADE;
DROP TABLE IF EXISTS "expenses" CASCADE;
DROP TABLE IF EXISTS "trips" CASCADE;
DROP TABLE IF EXISTS "refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "user_sessions" CASCADE;
DROP TABLE IF EXISTS "otp_codes" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
