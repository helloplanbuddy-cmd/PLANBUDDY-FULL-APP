-- Migration 002: Seat Overbooking Prevention
-- Adds a partial unique index on bookings(seat_id, trip_id, travel_date)
-- for active bookings, preventing two non-cancelled bookings for the same seat.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_seat_no_dup_active
  ON bookings(seat_id, trip_id, travel_date)
  WHERE seat_id IS NOT NULL AND status != 'cancelled';

-- Track migration
INSERT INTO schema_migrations (version, filename)
VALUES ('002', '002_seat_overbooking_prevention.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;