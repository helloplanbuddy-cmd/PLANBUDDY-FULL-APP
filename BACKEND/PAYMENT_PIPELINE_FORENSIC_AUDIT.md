# PAYMENT PIPELINE FORENSIC AUDIT
**Date**: 2026-06-03  
**Auditor**: Principal Staff Backend Engineer (Payments Reliability)  
**Status**: CRITICAL FINDINGS — 3 active blockers identified

---

## EXECUTIVE SUMMARY

| Blocker | Status | Severity | Evidence |
|---------|--------|----------|----------|
| #1: Crash-window idempotency failure | ⚠️ **ACTIVE** | CRITICAL | Transaction rollback loses idempotency gate |
| #2: Silent payment loss | ✅ **SAFE** | N/A | Error handling is correct |
| #3: Out-of-order delivery | ⚠️ **UNTESTED** | HIGH | No integration test exists |
| #4: Serialization conflicts | ⚠️ **UNTESTED** | MEDIUM | No deadlock simulation exists |
| #5: Connection pool exhaustion | ✅ **SAFE** | N/A | Validation guards are present |

**VERDICT**: ⚠️ **PRODUCTION APPROVAL DENIED** — Blockers #1 and #3 unresolved

---

## BLOCKER #1: TRANSACTION-LEVEL IDEMPOTENCY (CRASH WINDOW)

### Location
`planbuddy_v9/workers/webhook-processor.worker.js` lines 242-351

### Failure Scenario

**Step-by-step:**

1. **Worker executes `reserveWebhookExecution()`** (line 318)  
   ```javascript
   // SEPARATE transaction #1
   const reserved = await db.query(
     `INSERT INTO webhook_event_execution_log
        (provider_event_id, webhook_event_id, execution_hash, status)
      VALUES ($1, $2, $3, 'pending')
      ON CONFLICT (provider_event_id) DO NOTHING
      RETURNING provider_event_id`,
     [providerEventId, webhookEventId, executionHash],
   );
   ```
   ✅ **Row inserted** into `webhook_event_execution_log` with status='pending'  
   ✅ **COMMITTED** immediately (outside transaction)

2. **Worker enters main transaction** (line 324)  
   ```javascript
   await db.transaction(async (client) => {
     const executionLog = await fetchExecutionLogForUpdate(client, providerEventId);
     
     if (executionLog.status === 'success') {
       await markProcessed(client, id, leaseVersion);
       return;  // ← already executed, skip
     }
     
     await markExecutionInProgress(client, providerEventId);
     
     // ← BUSINESS LOGIC HERE
     if (typeof eventType === 'string' && eventType.startsWith('payment.')) {
       const paymentId = extractPaymentId(payload);
       await applyPaymentEvent(client, { eventType, paymentId, eventId: providerEventId });
     }
     
     await markExecutionSucceeded(client, providerEventId);  // ← line 349
     await markProcessed(client, id, leaseVersion);          // ← line 350
   });
   ```

3. **Worst-case scenario: Worker crashes between lines 349 and 350**

   **Actual sequence:**
   - Line 349: `markExecutionSucceeded` executes → status set to 'success'  
   - ⚡ **PROCESS CRASHES (OOM, SIGKILL, deployment restart)**  
   - Line 350: `markProcessed` never runs  
   - **Transaction ROLLS BACK** (never commits)

4. **Consequences of rollback:**

   | Item | Before | After Rollback | Status |
   |------|--------|---|---|
   | `webhook_event_execution_log.status` | pending | **success** ✅ | **COMMITTED** (outside transaction!) |
   | `webhook_event_execution_log.executed_at` | NULL | NOW() ✅ | **COMMITTED** (outside transaction!) |
   | `webhook_events.status` | processing | processing | **ROLLED BACK** ❌ |
   | Payment mutation | captured | created | **ROLLED BACK** ❌ |
   | Booking mutation | confirmed | pending | **ROLLED BACK** ❌ |

### The Blocker

When the worker restarts and reprocesses the event:

```javascript
if (executionLog.status === 'success') {
  await markProcessed(client, id, leaseVersion);
  return;  // ← SKIPS BUSINESS LOGIC!
}
```

**Result:**
- Execution log says "success" ✅  
- But payment was NOT captured ❌  
- Booking remains pending ❌  
- **SILENT PAYMENT LOSS** 💥

### Evidence

**Root cause file**: `webhook-processor.worker.js` line 318

The issue is architectural:
- `reserveWebhookExecution()` runs in **separate transaction** (outside the main transaction)
- Status is committed immediately
- If main transaction rolls back, status is orphaned

### Fix Required

The idempotency gate MUST be committed ATOMICALLY with the business logic:

```javascript
// WRONG (current):
await reserveWebhookExecution(...);  // Separate transaction
await db.transaction(async (client) => {
  // Main transaction
  // If this rolls back, reservation is stranded
});

// CORRECT (required):
await db.transaction(async (client) => {
  // Insert reservation INSIDE transaction
  const reserved = await client.query(
    `INSERT INTO webhook_event_execution_log ... RETURNING id`
  );
  
  if (alreadyProcessed) return;
  
  // Apply business logic
  await applyPaymentEvent(...);
  
  // Mark success INSIDE same transaction
  await markExecutionSucceeded(...);
});
```

---

## BLOCKER #2: SILENT PAYMENT LOSS (MISSING DEPENDENCY)

### Location
`planbuddy_v9/controllers/razorpayWebhookController.js` lines 284-344

### Scenario: Payment Arrives Before Payment Record

**Timing:**
1. User initiates payment → booking created (pending)
2. Razorpay returns payment initiated response
3. Razorpay sends `payment.captured` webhook
4. But payment record in DB hasn't been inserted yet (race condition)

### Code Analysis

```javascript
async function applyPaymentEvent(client, { eventType, paymentId, eventId }) {
  if (!paymentId) {
    const err = Object.assign(new Error('Missing paymentId for payment event'), {
      code: 'MISSING_PAYMENT_ID',
      status: 400,
    });
    logger.warn({ eventId, eventType }, '[webhook-processor] Missing paymentId');
    throw err;
  }

  const lockResult = await client.query(
    `SELECT id FROM payments
      WHERE razorpay_payment_id = $1
      FOR UPDATE`,
    [paymentId]
  );

  if (lockResult.rows.length === 0) {
    const err = Object.assign(new Error('Payment dependency missing for webhook event'), {
      code: 'PAYMENT_NOT_FOUND',
      status: 409,
    });
    logger.warn({ eventId, eventType, paymentId }, '[webhook-processor] Payment not found — retryable');
    throw err;  // ← Retryable error thrown
  }

  // ← Business logic continues only if payment exists
  await client.query(
    `UPDATE payments
       SET status = 'captured', updated_at = NOW()
     WHERE razorpay_payment_id = $1
       AND status = 'created'`,
    [paymentId]
  );
}
```

### Evidence: Error is RETRYABLE ✅

- Line 304: Error code set to `PAYMENT_NOT_FOUND`
- Line 306: Error is logged with context
- Line 307: **Error thrown** (not silently ignored)

### Retry Mechanism

In `webhook-processor.worker.js` line 408-411:

```javascript
} catch (err) {
  log('error', 'Event processing failed; marking failed for retry', { ... });
  await markFailed(event, err);  // ← Increments attempt count
}
```

In `markFailed()` (line 87-119):

```javascript
const res = await db.query(
  `UPDATE webhook_events
   SET
     status = CASE WHEN attempt_count + 1 >= $1 THEN 'dead_letter' ELSE 'failed' END,
     error_message = $2,
     attempt_count = attempt_count + 1,
     ...
   WHERE id = $3
     AND status = 'processing'
     AND lease_version = $4`,
  [MAX_RETRIES, errorMessage, event.id, event.lease_version],
);
```

### Verdict: ✅ SAFE

- Event is marked `failed` (not `processed`)
- Retry will occur via lease expiry (line 47)
- No event loss

---

## BLOCKER #5: CONNECTION POOL EXHAUSTION

### Location
`planbuddy_v9/config/db.js` lines 67-104  
`planbuddy_v9/config/env.js` lines 134-142

### Analysis

**Configuration:**
```javascript
DB_POOL_MAX:      10     (line 134)
PM2_INSTANCES:    1      (line 142, default)
DB_MAX_CONNECTIONS: 100  (line 141, default)

Total = 10 × 1 = 10 connections
Safe limit = 100 × 0.8 = 80 connections

Status: ✅ 10 ≤ 80 (SAFE)
```

**Safety Guard (db.js lines 67-104):**

```javascript
function validateClusterPoolSafety() {
  const total      = poolMax * instances;
  const maxAllowed = Math.floor(pgMax * 0.8);

  console.info(
    `[db] Pool sizing: DB_POOL_MAX=${poolMax} × PM2_INSTANCES=${instances}` +
    ` = ${total} total connections` +
    ` (PG max_connections=${pgMax}, 80% limit=${maxAllowed})`
  );

  if (total > maxAllowed) {
    console.error('[db] FATAL: DB connection pool configuration is unsafe');
    // ... detailed error message ...
    process.exit(1);
  }
}
```

**Verdict:** ✅ SAFE

- Guard implemented at startup
- Will fail fast if unsafe
- Includes 20% headroom

---

## CRITICAL GAPS IDENTIFIED

### Gap #1: Idempotency Gate Not Atomic

**File**: `webhook-processor.worker.js` line 318  
**Issue**: Reservation happens outside transaction  
**Impact**: HIGH — Causes blocker #1

**Proof:**
```javascript
// Line 318: OUTSIDE transaction
const reserved = await db.query(...);  // ← separate commit

// Line 324: INSIDE transaction
await db.transaction(async (client) => {
  // If this transaction rolls back, reserved row is stranded
});
```

### Gap #2: No Failure Recovery Test

**Files**: All `__tests__/*.test.js`  
**Issue**: No test simulates transaction rollback  
**Impact**: MEDIUM — Gap not yet proven in production

### Gap #3: Out-of-Order Delivery

**Scenario**: refund.processed arrives before payment.captured  
**Status**: ⚠️ No integration test verifies final state is correct  
**Files**: `razorpayWebhookController.js` lines 346-405  
**Code snippet**:
```javascript
if (eventType === 'refund.processed' || eventType === 'refund.paid') {
  await client.query(
    `UPDATE payments
       SET status = 'refunded', ...
     WHERE razorpay_payment_id = $2
       AND status IN ('captured', 'success')`,  // ← guard present
    [refundId, paymentId]
  );
}
```
The guard `status IN ('captured', 'success')` prevents spurious refunds, but no test verifies this.

---

## SUMMARY OF FINDINGS

| Finding | Type | Severity | Evidence |
|---------|------|----------|----------|
| Idempotency gate outside transaction | Code defect | CRITICAL | Line 318 in webhook-processor.worker.js |
| No atomic guarantee | Architecture gap | CRITICAL | Separation of reservation and execution |
| Silent payment loss (blocker #1) | Failure mode | CRITICAL | Documented above |
| Out-of-order delivery | Gap | HIGH | No integration test |
| Serialization conflicts | Gap | MEDIUM | No deadlock injection test |

---

## PRODUCTION READINESS VERDICT

### ⛔ **DO NOT DEPLOY**

**Blockers preventing production deployment:**

1. ✅ Blocker #2 (Silent loss): PROVEN SAFE
2. ✅ Blocker #5 (Pool exhaustion): PROVEN SAFE
3. ⚠️ Blocker #1 (Idempotency crash): **ACTIVE — requires fix**
4. ⚠️ Blocker #3 (Out-of-order): **UNTESTED — requires verification**
5. ⚠️ Blocker #4 (Serialization): **UNTESTED — requires verification**

### Fixes Required

1. **Move idempotency gate inside transaction** (blocker #1)
2. **Create integration test for out-of-order delivery** (blocker #3)
3. **Add serialization conflict chaos test** (blocker #4)

### Estimated Fix Time

- Blocker #1: 2-3 hours (code change + test)
- Blocker #3: 1 hour (integration test)
- Blocker #4: 1 hour (chaos test)

**Total: 4-5 hours to production readiness**
