## BLOCKER #3: COMPLETE EVIDENCE PACKAGE

### ARTIFACT 1: Razorpay Webhook Delivery Model (from code assumptions)

From razorpayWebhookController.js, the system assumes:
- **At-least-once delivery**: Line 9 comment: "1000 retries of the same event"
- **Retries until 200 OK**: Line 276 comment: "Always 200 — stops Razorpay retrying"
- **Deduplication required**: Line 242 comment: "CONFLICT guard makes retries safe"
- **Possible out-of-order or delayed**: Lines 306,363,379 mark missing dependencies as "retryable"

### ARTIFACT 2: Payment State Machine (extracted from code)

```
State Transitions:
  created  → captured   [guard: WHERE status='created']
  created  → failed     [guard: WHERE status='created']
  captured → refunded   [guard: WHERE status IN ('captured','success')]
  
Transition Execution:
  applyPaymentEvent, line 321-327: payment.captured ← conditional guard present
  applyRefundEvent, line 385-390: payment.refunded ← conditional guard present
```

### ARTIFACT 3: Booking State Machine (extracted from code)

```
State Transitions:
  pending    → confirmed [guard: WHERE status='pending'] (line 312-317)
  pending    → refunded  [NO GUARD] (line 393-398) ← VULNERABILITY
  confirmed  → refunded  [NO GUARD] (line 393-398) ← VULNERABILITY
  
Critical: Booking can transition directly to 'refunded' from ANY state without guarding payment state
```

### ARTIFACT 4: Trigger and Constraint Map

**enforce_payment_state_invariance (migration 130, line 38-57)**
```plpgsql
BEFORE INSERT/UPDATE on payments:
  IF NEW.status='captured' AND booking_status != 'paid' → EXCEPTION
  IF NEW.status IN ('refunded','partially_refunded') AND booking_status != 'refunded' → EXCEPTION
```
Status: Symmetric guard for captured and refunded states ✓

**enforce_booking_payment_invariance (migration 130, line 71-87)**
```plpgsql
BEFORE INSERT/UPDATE on bookings:
  SELECT status FROM payments WHERE booking_id=$1 AND status='captured'
  IF payment_status IS NOT NULL AND NEW.payment_status != 'paid' → EXCEPTION
```
Status: **ASYMMETRIC** - only checks for 'captured' payments, NOT for 'refunded' ✗
Missing: No check for payments.status IN ('refunded','partially_refunded')

### ARTIFACT 5: Convergence Matrix Test Results

**Execution**: blocker-3-scenarios.test.js (5 scenarios, 8 total assertions)

| Scenario | Event Order | Expected State | Actual State | Result | Root Cause |
|----------|-------------|------------------|---------------|--------|-----------|
| A | payment.captured → refund.processed | P:refunded, B:refunded | P:captured, B:refunded | **FAIL** | Payment UPDATE blocked by trigger (booking not yet refunded), booking UPDATE succeeds (unguarded) |
| B | refund.processed → payment.captured | Depends on retry logic | P:captured, B:paid | PASS* | Refund UPDATE skipped (payment not yet captured), then capture succeeds |
| C | refund.processed → refund.processed | Idempotent/P:refunded | P:captured, B:paid | **FAIL** | Same as A: first refund fails, duplicate also skipped |
| D | payment.captured → payment.captured | Idempotent/P:captured | P:captured, B:paid | PASS | Payment guarded by WHERE, booking guarded |
| E | capture → refund → capture | Final/P:refunded | P:captured, B:paid | **FAIL** | Refund fails (same as A), recapture skipped |

**Summary**: 3/5 scenarios failing. All failures involve refund-after-capture transitions where booking UPDATE succeeds but payment UPDATE fails.

### ARTIFACT 6: Architecture Determination

**Intended Architecture: B (Retry/Requeue)**

Evidence from code:
- Line 306: "retryable" comment when payment missing
- Line 363: "retryable" comment when refund missing payment dependency  
- Line 379: "retryable" comment when payment missing for refund
- Returns 409 Conflict status to signal retry → queue supervisor should requeue

**Critical Flaw in Architecture B Implementation**:
- When invariant trigger blocks an UPDATE (not a missing dependency), no 409 is returned
- Exception is caught in try/catch block without re-throwing as 409
- Booking UPDATE proceeds anyway (unguarded) → inconsistent state persists
- No retry signal generated → payment never re-queued

## SYNTHESIS

**The Bug**: Three separate defects combine to cause silent payment loss:

1. **Trigger Defect** (migration 130): `enforce_booking_payment_invariance` asymmetric
   - Checks: captured payment exists → booking must be 'paid' ✓
   - Missing: refunded payment exists → booking must be 'refunded' ✗

2. **SQL Guard Defect** (razorpayWebhookController.js line 393-398): Booking UPDATE unguarded
   - Payment UPDATE for refund guarded by trigger (requires booking='refunded')
   - Booking UPDATE for refund has no WHERE clause guarding payment state
   - Result: When refund UPDATE fails due to invariant violation, booking UPDATE still succeeds

3. **Error Handling Defect** (razorpayWebhookController.js line ~98): Invariant violation not treated as retryable
   - Should re-throw as 409 to trigger requeueing
   - Currently exception caught silently → no retry signal

## Production Impact

**When out-of-order refund arrives** (before booking transitioned to 'paid'):
1. Payment UPDATE fails (blocked by enforce_payment_state_invariance trigger)
2. Booking UPDATE succeeds (no guard)
3. Payment remains in 'captured', booking marked 'refunded'
4. System thinks refund succeeded but money never actually refunded
5. No retry scheduled → **silent payment loss**

## Test Coverage

- Test file: `__tests__/blocker-3-scenarios.test.js`
- Failing tests: A, C, E (3/5 scenarios)
- Assertions: 8 total, 4 failing
- Coverage: All webhook ordering permutations for payment.captured and refund.processed events
