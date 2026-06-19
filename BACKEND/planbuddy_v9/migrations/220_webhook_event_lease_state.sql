-- =============================================================================
-- Migration 220: Add webhook event lease and retry tracking columns
-- =============================================================================
-- This migration adds the missing webhook event execution lease state used by
-- the worker claim/retry loop and crash-window idempotency tests.
--
-- It is intentionally idempotent and safe for existing databases.
-- =============================================================================

BEGIN;

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS lease_version BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

UPDATE webhook_events
SET lease_version = 0
WHERE lease_version IS NULL;

UPDATE webhook_events
SET attempt_count = 0
WHERE attempt_count IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'webhook_events'
      AND indexname = 'idx_webhook_events_status_lease_expires_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_webhook_events_status_lease_expires_at ON webhook_events (status, lease_expires_at)';
  END IF;
END $$;

COMMIT;
