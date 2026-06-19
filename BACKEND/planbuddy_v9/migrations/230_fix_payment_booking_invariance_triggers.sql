-- Migration 230: Fix payment/booking invariance triggers
-- Rebuild both invariance triggers as deferred constraint triggers so
-- payment/refund updates and booking state updates can coexist in one transaction.

BEGIN;

DROP TRIGGER IF EXISTS trg_payments_state_invariance ON payments;
DROP TRIGGER IF EXISTS trg_bookings_payment_invariance ON bookings;

CREATE CONSTRAINT TRIGGER trg_payments_state_invariance
  AFTER INSERT OR UPDATE ON payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_state_invariance();

CREATE CONSTRAINT TRIGGER trg_bookings_payment_invariance
  AFTER INSERT OR UPDATE ON bookings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_payment_invariance();

INSERT INTO schema_migrations (version, filename, run_at)
VALUES ('230', '230_fix_payment_booking_invariance_triggers.sql', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
