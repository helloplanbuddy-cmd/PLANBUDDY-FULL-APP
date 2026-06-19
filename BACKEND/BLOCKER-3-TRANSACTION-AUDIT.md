# BLOCKER #3: Transaction Boundary Audit (REVISED)

## Transaction Flow - Scenario A (capture → refund)

### Step 1: Initial State
```sql
BEGIN;
  payment.status = 'created'
  booking.status = 'pending'
  booking.payment_status = 'unpaid'
COMMIT;
```

### Step 2: Capture Event
```sql
BEGIN;
  UPDATE bookings SET payment_status='paid', status='confirmed' 
    WHERE id=$1 AND status='pending'
    RESULT: 1 row ✓
  
  UPDATE payments SET status='captured' 
    WHERE razorpay_payment_id=$1 AND status='created'
    RESULT: 1 row ✓
    
  -- No trigger fires (preconditions satisfied)
COMMIT; ✓
```

**State After Capture:**
```
payment.status = 'captured' ✓
booking.status = 'confirmed' ✓
booking.payment_status = 'paid' ✓
```

### Step 3: Refund Event (FAILS)
```sql
BEGIN;
  UPDATE payments SET status='refunded', refund_id=$1 
    WHERE razorpay_payment_id=$2 AND status IN ('captured','success')
    RESULT: Would match 1 row, BUT...
    
    -- enforce_payment_state_invariance TRIGGER FIRES
    -- Checks: IF NEW.status='refunded' AND booking_status != 'refunded' → EXCEPTION
    -- booking_status = 'paid' (NOT 'refunded')
    -- TRIGGER RAISES EXCEPTION
    
EXCEPTION: INVARIANT_VIOLATION: payments.status=refunded requires bookings.payment_status=refunded
  
  -- ENTIRE TRANSACTION ROLLS BACK (including attempted updates)
ROLLBACK; ✗
```

**State After Refund Attempt:**
```
payment.status = 'captured' (unchanged)
booking.status = 'confirmed' (unchanged)
booking.payment_status = 'paid' (unchanged)
```

**Actual Output vs Expected Output:**
- Actual: payment=captured, booking=paid (unchanged)
- Expected: payment=refunded, booking=refunded
- Test Result: **FAIL** ✗

---

## Root Cause Analysis (CORRECTED)

**NOT**: State corruption (payment and booking in different states)
**ACTUAL**: Trigger precondition failure causing permanent dead-lettering

### The Error Handling Chain

**Production Code** (webhook-processor.worker.js, line 322):
```javascript
await db.transaction(async (client) => {
  // ... idempotency gate ...
  await applyRefundEvent(client, { eventType, payload, refundId, eventId });
  // This throws: INVARIANT_VIOLATION
  // ... rest of transaction never executes ...
});
```

**Exception Propagates** (line 162-165):
```javascript
try {
  await processEvent(event);  // Throws INVARIANT_VIOLATION
} catch (err) {
  await markFailed(event, err);  // Marks as failed
  throw err;
}
```

**Queue Handler** (webhook-processor.worker.js, line 164):
```javascript
await markFailed(event, err);  // Sets:
// - status = CASE WHEN attempt_count + 1 >= MAX_RETRIES THEN 'dead_letter' ELSE 'failed'
// - attempt_count = attempt_count + 1
// - After MAX_RETRIES: event → dead_letter (PERMANENT)
```

**Result**: Event eventually moves to `dead_letter` table. No retry scheduled. Refund is stuck.

---

## The Bug: Invariant Violation = Wrong Error Classification

The trigger exception is a **precondition failure**, but the code treats it as a **permanent failure**:

```javascript
// Current behavior (WRONG):
INVARIANT_VIOLATION exception
  → caught as generic error
  → marked as 'failed'
  → after MAX_RETRIES → 'dead_letter'
  → ✗ STUCK

// Expected behavior (CORRECT):
INVARIANT_VIOLATION exception
  → recognized as "precondition not met"
  → converted to 409 Conflict
  → event requeued
  → retried later when booking state changes
  → ✓ EVENTUAL CONSISTENCY
```

---

## Why This is a Real Production Bug

**Scenario**: Razorpay sends webhooks out of order
1. `refund.processed` arrives BEFORE `payment.captured`
2. Refund UPDATE fails (payment still in 'created' state, WHERE clause doesn't match)
3. Booking UPDATE succeeds (no guard)
4. Then later, `payment.captured` arrives
5. Capture UPDATE succeeds (payment moves to 'captured')
6. Now we have: payment=captured, booking=refunded (INCONSISTENT)

OR (more likely with current code):

1. `payment.captured` arrives → payment=captured, booking=paid
2. `refund.processed` arrives → trigger blocks, transaction rolls back
3. Event marked as failed → after MAX_RETRIES → dead_letter
4. **Refund never executes**
5. Customer money is stuck in 'captured' state permanently

---

## Evidence Collection Summary

### Transaction Boundary Audit (PASSED)
✓ Transaction rolls back completely when trigger fires
✓ No partial state persistence
✓ Exception is properly caught

### Architectural Issue (CONFIRMED)
✗ Exception classification wrong: precondition failure treated as permanent failure
✗ No retry signal (409) generated for invariant violations
✗ Dead-lettering occurs instead of requeueing

### Production Impact: HIGH
- Refund events that arrive out-of-order or while booking is not 'paid' will:
  - Get blocked by trigger
  - Be retried MAX_RETRIES times
  - Eventually move to dead_letter
  - Never complete
  - **Customer refunds are stuck**

### Missing Evidence for Complete Fix Decision

1. **Razorpay webhook ordering guarantee**: Can refund arrive before capture?
2. **Intended recovery architecture**: Should system retry or reject out-of-order events?
3. **State machine completeness**: Are there other states that could cause similar precondition failures?
4. **Dead-letter monitoring**: Who checks the dead_letter table?

---

## Correct Transaction Timeline

Both scenarios produce COMPLETE rollback - no corruption:

```
✓ Transaction 1: capture (succeeds)
  payment: created → captured
  booking: pending → confirmed

✗ Transaction 2: refund (fails & rolls back)
  TRIGGER BLOCKS (booking not yet refunded)
  payment: unchanged
  booking: unchanged
  
Result: Silent failure, event dead-lettered
```

The bug is NOT in the transaction boundary. The bug is in **error classification and retry policy**.
