# PRODUCTION BLOCKAGE RESOLUTION PLAN

**Date:** 2026-06-14  
**Status:** 🔴 PRODUCTION BLOCKED — 3 CRITICAL ITEMS MUST BE FIXED  
**Owner:** System Integration  

---

## BLOCKER #1: Redis Server Not Running

**Status:** 🔴 CRITICAL  
**Impact:** OTP cannot be stored or verified  
**Evidence:** `ECONNREFUSED 127.0.0.1:6379` when services attempt connection  

### Current State
```bash
$ redis-cli ping
Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

### Impact Chain
```
Redis down
  └─ OTP storage fails (otpService.storeOTP)
     └─ User cannot receive/verify OTP
  └─ Refresh token management fails (RefreshTokenService)
     └─ User sessions cannot persist
  └─ Rate limiting Redis store fails
     └─ Rate limits not enforced
  └─ Cache misses
     └─ Database load increases
```

### Fix Required

**Option A: Start Redis immediately (Dev/Testing)**
```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo service redis-server start

# Windows
# Download: https://github.com/microsoftarchive/redis/releases
# Or use WSL with Linux commands above

# Verify
redis-cli ping  # Should return PONG
redis-cli info server | grep version  # Show version
```

**Option B: Use Docker (Recommended for consistency)**
```bash
# Start Redis container
docker run -d --name redis -p 6379:6379 redis:latest

# Verify
docker exec redis redis-cli ping  # Should return PONG
```

**Option C: Use Docker Compose (Production-aligned)**
```bash
# Create docker-compose.yml with Redis service
cd BACKEND/planbuddy_v9
docker-compose up -d redis

# Verify
docker-compose exec redis redis-cli ping
```

### Validation After Fix

```bash
# Test 1: Verify connection
redis-cli ping
# Expected: PONG

# Test 2: Verify functionality
redis-cli SET test-key "test-value" EX 10
redis-cli GET test-key
# Expected: "test-value"

# Test 3: Run backend services
cd BACKEND/planbuddy_v9
npm test 2>&1 | grep -E "redis|FAIL|PASS"
# Expected: Tests should not fail with "ECONNREFUSED"
```

---

## BLOCKER #2: SMS Provider Not Configured

**Status:** 🔴 CRITICAL  
**Impact:** OTP cannot be delivered to users  
**Evidence:**
```bash
$ cat .env | grep -i TWILIO
# Empty — no TWILIO settings found
```

### Current State

**In smsService.js:**
```javascript
if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
  console.error('[smsService] Twilio credentials missing');
  return { otp, success: false };  // ← Service fails silently
}
```

### Impact Chain

```
SMS_PROVIDER not configured
  └─ smsService.sendOTP() returns success: false
     └─ Frontend receives error: "Failed to send OTP"
     └─ User cannot proceed
```

### Fix Required — Choose One

**Option A: Use Mock Provider (IMMEDIATE — Dev/Testing Only)**
```bash
# Add to .env
SMS_PROVIDER=mock
```

**Effect:**
- OTP sent to console logs instead of Twilio
- User receives OTP in terminal/logs
- Acceptable for development and integration testing

**File to update:** `.env`
```
SMS_PROVIDER=mock
# No TWILIO_* credentials needed
```

**Option B: Use Twilio (PRODUCTION)**

**Prerequisites:**
1. Twilio account: https://www.twilio.com/console
2. Account SID: https://www.twilio.com/console/account/settings
3. Auth Token: https://www.twilio.com/console/account/settings
4. Twilio Phone Number: https://www.twilio.com/console/phone-numbers/incoming

**Add to .env:**
```bash
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC<your-account-sid>
TWILIO_AUTH_TOKEN=<your-auth-token>
TWILIO_PHONE_NUMBER=+1<twilio-number>
```

**Example .env (Twilio):**
```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC123abc456def789ghi012jkl345
TWILIO_AUTH_TOKEN=abc123def456ghi789jkl012mno345pq
TWILIO_PHONE_NUMBER=+15551234567
```

**Option C: Use Another SMS Provider**
- AWS SNS
- Firebase Cloud Messaging
- Custom SMS API

**File to update:** `BACKEND/planbuddy_v9/services/smsService.js`
(Add provider case in `switch (env.SMS_PROVIDER)`)

### Validation After Fix

```bash
# Test 1: OTP generation
cd BACKEND/planbuddy_v9
node -e "const s = require('./services/smsService'); s.sendOTP('+919876543210').then(console.log)"
# Expected (mock): { otp: '123456', success: true }
# Expected (Twilio): { otp: '123456', success: true } or { otp: '..', success: false } if SMS fails

# Test 2: Run integration tests
npm test -- __tests__/auth-otp-integration.test.js --testNamePattern="send-otp"

# Test 3: Manual flow
POST http://localhost:8000/api/auth/send-otp
{ "phone": "+919876543210" }
# Expected: { success: true, message: "OTP sent", ... }
```

---

## BLOCKER #3: NEXT_PUBLIC_API_BASE_URL Not Set

**Status:** 🔴 CRITICAL  
**Impact:** Frontend cannot reach backend; all OTP requests fail  
**Evidence:**
```bash
$ grep -n "NEXT_PUBLIC_API_BASE_URL" FRONTEND/.env.local
# Empty or not found

$ grep -n "NEXT_PUBLIC_API_BASE_URL" FRONTEND/app/api/auth/send-otp/route.ts
65:    const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
     └─ Falls back to '' (empty string = same origin)
```

### Current State

**Frontend routing logic:**
```typescript
// send-otp/route.ts
const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const res = await fetch(`${base}/api/auth/send-otp`, { ... });
// If base = '', request goes to:
//   localhost:3000/api/auth/send-otp
// instead of:
//   localhost:8000/api/auth/send-otp (backend)
```

### Impact Chain

```
NEXT_PUBLIC_API_BASE_URL not set
  └─ Frontend proxy uses '' (same origin)
     └─ Requests go to frontend server (port 3000)
     └─ Frontend doesn't have /api/auth/* endpoints
     └─ 404 error returned to user
     └─ OTP flow fails
```

### Fix Required

**For Development:**
```bash
# FRONTEND/.env.local (create if not exists)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Or if backend on different machine:
NEXT_PUBLIC_API_BASE_URL=http://192.168.1.100:8000
```

**For Production:**
```bash
# FRONTEND/.env.production (create if not exists)
NEXT_PUBLIC_API_BASE_URL=https://api.planbuddy.com
# or
NEXT_PUBLIC_API_BASE_URL=https://backend.example.com
```

**File to update:** `FRONTEND/.env.local` (create new file)

**Example .env.local:**
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_STRIPE_KEY=pk_test_...
# ... other frontend env vars
```

### Validation After Fix

```bash
# Test 1: Verify env var loaded
cd FRONTEND
echo $NEXT_PUBLIC_API_BASE_URL
# Expected: http://localhost:8000

# Test 2: Check frontend build includes URL
npm run build
grep -r "http://localhost:8000" .next/static/chunks/
# Expected: URL appears in chunks (bundled)

# Test 3: Manual request
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210"}' \
  -v  # Verbose to see redirect/proxy headers

# Test 4: Run frontend tests (if available)
npm test -- __tests__/api/auth.test.ts
```

---

## IMPLEMENTATION SEQUENCE

### Step 1: Start Redis (5 minutes)
```bash
# Recommended: Docker Compose
cd BACKEND/planbuddy_v9
docker-compose up -d redis
# or
redis-server --port 6379
```

### Step 2: Configure SMS Provider (2 minutes)
```bash
# Add to BACKEND/planbuddy_v9/.env
SMS_PROVIDER=mock  # Start with mock

# For production, upgrade to Twilio later
```

### Step 3: Configure API Base URL (2 minutes)
```bash
# Create FRONTEND/.env.local
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > FRONTEND/.env.local
```

### Step 4: Test Backend OTP Service (5 minutes)
```bash
cd BACKEND/planbuddy_v9

# Test OTP send
npm test -- __tests__/auth-otp-integration.test.js --testNamePattern="send-otp"

# Test OTP verify
npm test -- __tests__/auth-otp-integration.test.js --testNamePattern="verify-otp"

# All tests
npm test -- __tests__/auth-otp-integration.test.js
```

### Step 5: Test Frontend Proxy (5 minutes)
```bash
# Build frontend
cd FRONTEND
npm run build

# Start frontend (development)
npm run dev

# Test manual flow in browser:
# 1. Open http://localhost:3000
# 2. Go to login page
# 3. Enter phone: +919876543210
# 4. Click "Send OTP"
# 5. Check browser console for response
# 6. Enter mock OTP (from backend logs) or SMS
# 7. Verify token received
```

### Step 6: Full E2E Test (10 minutes)
```bash
# Terminal 1: Start backend
cd BACKEND/planbuddy_v9
npm run dev

# Terminal 2: Start frontend
cd FRONTEND
npm run dev

# Terminal 3: Run Playwright tests (if available)
npx playwright test e2e/auth-otp-flow.test.ts

# Or manual test:
# 1. Browser: http://localhost:3000/login
# 2. Phone: +919876543210
# 3. Send OTP → Check backend logs for OTP
# 4. Enter OTP in browser
# 5. Should redirect to /dashboard
# 6. Verify you're logged in
```

---

## VALIDATION CHECKLIST

- [ ] Redis running on localhost:6379
- [ ] redis-cli ping returns PONG
- [ ] SMS_PROVIDER set to "mock" or "twilio" in .env
- [ ] NEXT_PUBLIC_API_BASE_URL set in FRONTEND/.env.local
- [ ] Backend test suite passes (npm test)
- [ ] OTP integration tests pass
- [ ] Frontend builds without errors (npm run build)
- [ ] Frontend dev server starts without errors
- [ ] Manual login flow works end-to-end
- [ ] User receives OTP (in logs or SMS)
- [ ] User can verify OTP and login
- [ ] Access token and refresh token issued
- [ ] Session persists after page reload

---

## EXPECTED OUTCOMES AFTER FIXES

### OTP Send Flow
```
User enters phone
  ↓
Frontend POST /api/auth/send-otp
  ↓
Frontend proxies to backend via NEXT_PUBLIC_API_BASE_URL
  ↓
Backend otpController.sendOtp()
  ↓
smsService.sendOTP() sends OTP (mock or Twilio)
  ↓
otpService.storeOTP() stores hash in Redis
  ↓
200 response: { success: true, message: "OTP sent" }
  ↓
User receives OTP (console logs if mock, SMS if Twilio)
```

### OTP Verify Flow
```
User enters OTP
  ↓
Frontend POST /api/auth/verify-otp
  ↓
Frontend proxies to backend
  ↓
Backend otpController.verifyOtp()
  ↓
otpService.verifyOTP() verifies hash from Redis
  ↓
Database: User created if new
  ↓
RefreshTokenService.createRefreshToken() → Redis
  ↓
generateToken() → JWT signed with JWT_SECRET
  ↓
Response: 200 { data: { accessToken, refreshToken, user } }
  ↓
Frontend stores tokens in cookies (HttpOnly)
  ↓
Frontend redirects to /dashboard
```

### Session Check Flow
```
Frontend GET /api/auth/session
  ↓
Backend authenticates access token from cookie
  ↓
JWT verified (signature, exp, iss, aud, jti)
  ↓
User loaded from database
  ↓
Response: 200 { user: { id, phone, role, ... } }
```

---

## TROUBLESHOOTING

### "ECONNREFUSED 127.0.0.1:6379"
- **Cause:** Redis not running
- **Fix:** `redis-server --port 6379` or `docker-compose up -d redis`

### "Failed to send OTP"
- **Cause:** SMS provider not configured
- **Fix:** Add `SMS_PROVIDER=mock` to .env, or configure Twilio credentials

### "404 Not Found" on POST /api/auth/send-otp
- **Cause:** Frontend proxy reaching wrong endpoint (same origin, port 3000)
- **Fix:** Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

### "CORS error" on frontend request
- **Cause:** Backend not allowing requests from frontend origin
- **Fix:** Check backend CORS middleware: `cors({ origin: process.env.FRONTEND_URL, ... })`

### "Invalid OTP" on verification
- **Cause:** OTP expired (5 min TTL) or attempt limit (5 max)
- **Fix:** Send new OTP (click "Resend OTP" button)

### "User not found after verification"
- **Cause:** Database transaction failed during user creation
- **Fix:** Check database connection, verify schema, check logs

---

## PRODUCTION CHECKLIST AFTER FIXES

- [ ] Redis running in production environment
- [ ] SMS provider configured with production credentials
- [ ] NEXT_PUBLIC_API_BASE_URL points to production API
- [ ] Backend and frontend deployed
- [ ] Health check endpoints passing
- [ ] Monitoring/alerting configured
- [ ] Backup/recovery procedures tested
- [ ] Security audit completed
- [ ] Load testing completed
- [ ] Database backups configured
- [ ] SSL/TLS certificates configured
- [ ] DDoS protection configured

---

**Status:** 🔴 **AWAITING IMPLEMENTATION OF FIXES**  
**Estimated Total Time:** 30 minutes  
**Go/No-Go Decision:** READY TO PROCEED AFTER FIXES  

