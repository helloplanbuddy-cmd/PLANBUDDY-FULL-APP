-- ============================================================
-- Migration 001: Initial Schema — PlanBuddy v5
-- Created: 2026-06-10
-- ============================================================

-- Users
CREATE TABLE "users" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "phone"       TEXT NOT NULL UNIQUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "version"     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX "users_phone_idx" ON "users"("phone");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- OTP Codes
CREATE TABLE "otp_codes" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT,
  "phone"       TEXT NOT NULL,
  "otp_hash"    TEXT NOT NULL,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "used_at"     TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ip_address"  TEXT,
  "device_id"   TEXT,
  CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");

-- User Sessions
CREATE TABLE "user_sessions" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "user_id"      TEXT NOT NULL,
  "device_id"    TEXT NOT NULL,
  "device_name"  TEXT,
  "device_type"  TEXT,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at"   TIMESTAMPTZ NOT NULL,
  "revoked_at"   TIMESTAMPTZ,
  "ip_address"   TEXT,
  "user_agent"   TEXT,
  CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_device_id_idx" ON "user_sessions"("device_id");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- Refresh Tokens
CREATE TABLE "refresh_tokens" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "user_id"        TEXT NOT NULL,
  "session_id"     TEXT NOT NULL,
  "family"         TEXT NOT NULL UNIQUE,
  "token_hash"     TEXT NOT NULL,
  "expires_at"     TIMESTAMPTZ NOT NULL,
  "revoked_at"     TIMESTAMPTZ,
  "revoked_reason" TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "rotated_at"     TIMESTAMPTZ,
  CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE
);
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- Trips
CREATE TABLE "trips" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "from"        TEXT NOT NULL,
  "to"          TEXT NOT NULL,
  "start_date"  TIMESTAMPTZ,
  "end_date"    TIMESTAMPTZ,
  "budget"      INTEGER NOT NULL DEFAULT 0,
  "status"      TEXT NOT NULL DEFAULT 'draft',
  "itinerary"   JSONB,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "version"     INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "trips_user_id_idx" ON "trips"("user_id");
CREATE INDEX "trips_created_at_idx" ON "trips"("created_at");
CREATE INDEX "trips_status_idx" ON "trips"("status");
CREATE INDEX "trips_user_id_status_idx" ON "trips"("user_id", "status");

-- Expenses
CREATE TABLE "expenses" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "trip_id"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "category"    TEXT NOT NULL,
  "date"        TIMESTAMPTZ NOT NULL,
  "notes"       TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "version"     INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE
);
CREATE INDEX "expenses_user_id_idx" ON "expenses"("user_id");
CREATE INDEX "expenses_trip_id_idx" ON "expenses"("trip_id");
CREATE INDEX "expenses_user_id_trip_id_idx" ON "expenses"("user_id", "trip_id");
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- Memories
CREATE TABLE "memories" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "trip_id"     TEXT,
  "note"        TEXT NOT NULL,
  "mood"        TEXT,
  "location"    TEXT,
  "media_urls"  JSONB,
  "ai_summary"  TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "version"     INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "memories_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL
);
CREATE INDEX "memories_user_id_idx" ON "memories"("user_id");
CREATE INDEX "memories_trip_id_idx" ON "memories"("trip_id");
CREATE INDEX "memories_created_at_idx" ON "memories"("created_at");

-- Chat Sessions
CREATE TABLE "chat_sessions" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "trip_id"     TEXT,
  "messages"    JSONB NOT NULL DEFAULT '[]',
  "summary"     TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "version"     INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");
CREATE INDEX "chat_sessions_created_at_idx" ON "chat_sessions"("created_at");

-- AI Usage
CREATE TABLE "ai_usage" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "user_id"        TEXT NOT NULL,
  "provider"       TEXT NOT NULL DEFAULT 'anthropic',
  "model"          TEXT NOT NULL,
  "endpoint"       TEXT NOT NULL,
  "tokens_input"   INTEGER NOT NULL DEFAULT 0,
  "tokens_output"  INTEGER NOT NULL DEFAULT 0,
  "total_tokens"   INTEGER NOT NULL DEFAULT 0,
  "cost_usd"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latency_ms"     INTEGER,
  "success"        BOOLEAN NOT NULL DEFAULT TRUE,
  "error_code"     TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "ai_usage_user_id_idx" ON "ai_usage"("user_id");
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage"("user_id", "created_at");
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");
CREATE INDEX "ai_usage_endpoint_idx" ON "ai_usage"("endpoint");

-- Sync Jobs
CREATE TABLE "sync_jobs" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "user_id"     TEXT NOT NULL,
  "entity"      TEXT NOT NULL,
  "entity_id"   TEXT NOT NULL,
  "operation"   TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "payload"     JSONB NOT NULL,
  "retries"     INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 4,
  "error_msg"   TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "synced_at"   TIMESTAMPTZ,
  CONSTRAINT "sync_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "sync_jobs_user_id_idx" ON "sync_jobs"("user_id");
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs"("status");
CREATE INDEX "sync_jobs_user_id_status_idx" ON "sync_jobs"("user_id", "status");
CREATE INDEX "sync_jobs_created_at_idx" ON "sync_jobs"("created_at");

-- Sync Events
CREATE TABLE "sync_events" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "job_id"          TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "entity"          TEXT NOT NULL,
  "entity_id"       TEXT NOT NULL,
  "operation"       TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "entity_version"  INTEGER NOT NULL DEFAULT 1,
  "conflict_data"   JSONB,
  "resolved_by"     TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "sync_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "sync_jobs"("id") ON DELETE CASCADE,
  CONSTRAINT "sync_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "sync_events_job_id_idx" ON "sync_events"("job_id");
CREATE INDEX "sync_events_user_id_idx" ON "sync_events"("user_id");
CREATE INDEX "sync_events_entity_entity_id_idx" ON "sync_events"("entity", "entity_id");
CREATE INDEX "sync_events_created_at_idx" ON "sync_events"("created_at");
