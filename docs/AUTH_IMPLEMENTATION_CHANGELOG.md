# AUTH UNIFICATION IMPLEMENTATION — CHANGE LOG

**Date:** 2026-06-14
**Objective:** Backend becomes authentication authority for OTP flows
**Status:** IMPLEMENTATION COMPLETE — VERIFICATION PENDING

---

## FILES MODIFIED / CREATED

### BACKEND — New Files

#### 1. `BACKEND/planbuddy_v9/services/smsService.js`
- **Purpose:** Send OTP via Twilio or mock provider
- **Changes:** NEW FILE (56 lines)
  - Generates random 6-digit OTP
  - Sends via Twilio API or logs mock
  - Returns `{ otp, success }`
- **Dependencies:** `env.SMS_PROVIDER`, `env.TWILIO_*` credentials
- **Security Impact:** Exposes SMS provider selection; must validate secrets in env
- **Rollback:** Remove file; restore SMS to frontend

#### 2. `BACKEND/planbuddy_v9/services/otpService.js`
- **Purpose:** Store and verify OTP with Redis
- **Changes:** NEW FILE (47 lines)
  - `storeOTP(phone, otp)` → Redis key-value with SHA256 hash
  - `verifyOTP(phone, otp)` → compare hash, track attempts, enforce TTL
  - Constants: 5-min TTL, 5 attempts max
- **Dependencies:** `redis` client, `crypto.createHash`
- **Security Impact:** OTP never stored plaintext; rate limiting via attempt counter
- **Rollback:** Remove file; restore to Prisma-based OTP

#### 3. `BACKEND/planbuddy_v9/controllers/otpController.js`
- **Purpose:** HTTP handlers for OTP send/verify
- **Changes:** NEW FILE (51 lines)
  - `POST /auth/send-otp` → calls smsService, stores via otpService
  - `POST /auth/verify-otp` → verifies hash, creates/gets user, issues tokens
  - Creates user in DB if not exists
  - Issues access token via `generateToken()`, refresh via `RefreshTokenService`
- **Dependencies:** `smsService`, `otpService`, `db`, `RefreshTokenService`, `jwt`
- **Security Impact:** Authenticates user; manages token issuance
- **Rollback:** Remove file; restore OTP to frontend

### BACKEND — Modified Files

#### 4. `BACKEND/planbuddy_v9/routes/auth.js`
- **Purpose:** Register OTP routes
- **Changes:** 
  - Line ~45: Added imports: `const otpController = require('../controllers/otpController')`
  - Line ~48: Added `router.post('/send-otp', otpLimiter || authLimiter, otpController.sendOtp)`
  - Line ~49: Added `router.post('/verify-otp', otpLimiter || authLimiter, otpController.verifyOtp)`
- **Dependencies:** `otpController`, `otpLimiter` (may fallback to `authLimiter`)
- **Security Impact:** Routes now exposed; rate limiting applied
- **Rollback:** Remove route registrations

---

### FRONTEND — Modified Files

#### 5. `FRONTEND/app/api/auth/send-otp/route.ts`
- **Purpose:** Proxy OTP send to backend
- **Changes:**
  - Removed imports: `sendOTPInternal`, `storeOTP`, `signAccessToken`, etc.
  - Replaced internal logic with fetch to backend
  - Line ~65: `const base = process.env.NEXT_PUBLIC_API_BASE_URL || ''`
  - Line ~66-70: Fetch to `${base}/api/auth/send-otp`, forward request/response
- **Dependencies:** `NEXT_PUBLIC_API_BASE_URL` env var must point to backend
- **Security Impact:** Frontend no longer signs/stores tokens; OTP handling moved to backend
- **Rollback:** Restore full OTP send implementation locally

#### 6. `FRONTEND/app/api/auth/verify-otp/route.ts`
- **Purpose:** Proxy OTP verify to backend, pass through tokens
- **Changes:**
  - Removed imports: `verifyOTPHash`, `getOrCreateUser`, `storeRefreshFamily`, `signAccessToken`, `signRefreshToken`, etc.
  - Replaced full OTP verification flow with backend proxy
  - Line ~53: Fetch to backend `/api/auth/verify-otp`
  - Line ~56-61: Mirror Set-Cookie headers from backend response
- **Dependencies:** `NEXT_PUBLIC_API_BASE_URL` env var
- **Security Impact:** Frontend no longer verifies OTP or signs tokens; relies on backend
- **Rollback:** Restore full local OTP verification, token generation

#### 7. `FRONTEND/app/api/auth/session/route.ts`
- **Purpose:** Proxy session check and token refresh to backend
- **Changes:**
  - Removed imports: `verifyRefreshToken`, `signAccessToken`, `signRefreshToken`, `validateRefreshFamily`, etc.
  - Replaced GET logic: now proxies to backend
  - Replaced POST logic: now proxies to `/api/auth/refresh` (was local session rotate)
  - Line ~30, ~55: Fetch to backend, forward cookies
- **Dependencies:** `NEXT_PUBLIC_API_BASE_URL` env var
- **Security Impact:** Frontend no longer manages session state locally; delegates to backend
- **Rollback:** Restore full session management logic

---

## DEPENDENCY IMPACT

| Component | Dependency | Status | Risk |
|-----------|-----------|--------|------|
| otpService | redis | ✓ Existing | Low — Redis already used for other services |
| otpController | db, RefreshTokenService | ✓ Existing | Medium — must have DB connection, refresh token service working |
| auth routes | otpLimiter | ⚠ MAY FAIL | High — otpLimiter may not exist in rateLimit.js; code uses `otpLimiter \|\| authLimiter` fallback |
| frontend send-otp | NEXT_PUBLIC_API_BASE_URL | ⚠ NOT SET | **CRITICAL** — if not set, requests go to same-origin proxy (will fail if not configured) |
| frontend verify-otp | NEXT_PUBLIC_API_BASE_URL | ⚠ NOT SET | **CRITICAL** |
| frontend session | NEXT_PUBLIC_API_BASE_URL | ⚠ NOT SET | **CRITICAL** |

---

## SECURITY IMPACTS

### Positive Changes
- ✅ OTP now hashed with SHA256 (never plaintext)
- ✅ Backend-authoritative token generation (single source of truth)
- ✅ Rate limiting applied at backend OTP endpoints
- ✅ Frontend no longer holds `JWT_SECRET` for signing

### Remaining Risks (TO BE VERIFIED)
- ❓ SMS provider credentials may be exposed if env vars leaked
- ❓ OTP TTL hard-coded to 5 min (not configurable)
- ❓ Refresh token rotation strategy needs verification
- ❓ Frontend proxy introduces additional network hop (latency)
- ❓ Frontend cannot validate tokens offline anymore (depends on backend)

---

## EXPECTED FAILURES (PRE-VERIFICATION)

1. **otpLimiter not defined** — code assumes it exists but may not
2. **NEXT_PUBLIC_API_BASE_URL not set** — frontend proxies will fail silently
3. **Redis not available** — otpService will fail
4. **SMS provider not configured** — smsService will fail
5. **Database schema mismatch** — OTP table may not exist or have wrong schema

---

## VERIFICATION CHECKLIST

- [ ] Backend services load without errors
- [ ] OTP routes registered successfully
- [ ] Frontend can reach backend OTP endpoints
- [ ] OTP sent successfully
- [ ] OTP verified successfully
- [ ] User created/retrieved from DB
- [ ] Access token issued
- [ ] Refresh token issued
- [ ] Session can be refreshed
- [ ] Logout invalidates tokens
- [ ] Rate limiting enforced
- [ ] Database schema correct
- [ ] Migrations up to date
- [ ] Tests passing
- [ ] No security regressions

---

