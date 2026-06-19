# BLOCKER #3: Webhook Ordering — Complete Evidence Audit

## Phase 1-5: Root Cause Analysis (COMPLETE)

### Finding 1: Payment State Machine (from code)
```
created → captured (guarded: WHERE status='created')
created → failed   (guarded: WHERE status='created')
captured → refunded (guarded: WHERE status IN ('captured','success'))
```

### Finding 2: Booking State Machine (from code)
```
pending → confirmed (guarded: WHERE status='pending')
pending → refunded  (UNGUARDED: no WHERE on status)
confirmed → refunded (UNGUARDED: no WHERE on status)
```

### Finding 3: Trigger enforce_payment_state_invariance
Line 47-49: Blocks payment.status='captured' if booking.payment_status != 'paid'
Line 51-53: **BLOCKS** payment.status='refunded' if booking.payment_status != 'refunded'

### Finding 4: Trigger enforce_booking_payment_invariance  
**ASYMMETRIC**: Only checks captured payments (line 78)
- Does NOT check refunded or partially_refunded payments
- Allows booking.status='refunded' even when payment.status='captured'

### Finding 5: Production Execution Path
```
refund.processed event arrives:

1. applyRefundEvent() acquires FOR UPDATE lock on payment
2. Tries: UPDATE payments SET status='refunded' WHERE status IN ('captured','success')
3. Trigger enforce_payment_state_invariance fires
4. Trigger checks: is booking.payment_status='refunded'? 
5. If NO → Exception raised, payment UPDATE fails
6. Transaction rolls back
7. Exception caught silently (line 98 in test shows exception swallowed)
8. Function returns without retry signal
9. Meanwhile: UPDATE bookings SET payment_status='refunded' (line 392-394)
   - Has NO guard on payment.status
   - Succeeds anyway
10. Result: payment='captured', booking='refunded' (INCONSISTENT)
```

## Phase 6: Convergence Test Results

**Test Execution**: 5 webhook ordering scenarios
```
A: payment.captured → refund.processed    | FAIL | payment=captured, booking=refunded
B: refund.processed → payment.captured    | PASS | payment=captured, booking=paid
C: refund.processed → refund.processed    | FAIL | payment=captured, booking=paid
D: payment.captured → payment.captured    | PASS | payment=captured, booking=paid
E: cap → ref → cap                        | FAIL | payment=captured, booking=paid
```

**Failure Pattern**: All refund-first or refund-after-capture scenarios fail to transition payment to 'refunded'

## Phase 7: Architecture Determination

**System Architecture: B (Retry/Requeue)** with critical flaw

Evidence:
- Lines 306-307: Payment missing → 409 (retryable)
- Line 363: Refund without payment → 409 (retryable)
- Line 379: Payment missing for refund → 409 (retryable)
- Status code 409 Conflict signals should trigger requeueing

**The Flaw**: When invariant trigger blocks an UPDATE:
- No 409 is returned (exception is caught and swallowed)
- No retry signal is generated
- Booking UPDATE succeeds anyway (unguarded)
- System assumes operation succeeded when it actually failed

## Root Cause Summary

Three separate bugs combine to cause silent payment loss:

1. **Trigger Bug**: `enforce_booking_payment_invariance` only guards captured payments, not refunded
   - Should also check: IF payment.status IN ('refunded','partially_refunded') THEN booking.payment_status must be 'refunded'

2. **SQL Guard Bug**: Booking UPDATE at line 392-399 has no WHERE clause guarding payment state
   - Should be guarded: `WHERE id=... AND (payment_status != 'refunded' OR booking.status='pending')`
   - Or better: Guard with explicit state machine check

3. **Error Handling Bug**: Invariant violation exception caught without generating 409 retry signal
   - When trigger raises exception due to invariant violation, should re-throw as 409
   - Currently exception is caught in try/catch and silently swallowed

## Recommended Fix Priority

1. **Add Payment Status Guard to Booking UPDATE** (line 392-399)
   - WHERE clause that enforces: if booking is transitioning to 'refunded', verify payment is in refundable state
   - This is the fastest, most direct fix

2. **Fix Trigger `enforce_booking_payment_invariance`** (migration 130)
   - Add check for refunded payments symmetrically
   - Currently only checks for captured payments

3. **Improve Error Handling** (optionally)
   - Distinguish between "incorrect preconditions" (409 Conflict) and "system errors" (500)
   - Re-throw invariant violations as 409 to trigger requeueing

## Test Coverage After Fix

All 5 scenarios should pass:
- A, C, E: Payment must reach 'refunded' status with booking also 'refunded'
- B: Refund before capture should either reject with 409 or queue for retry
- D: Duplicate captures must be idempotent

Total assertions: 10+ (at least 2 per scenario)
