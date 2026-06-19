# TODO Stage 4 — OTP AUTH TEST FAILURE

## Information gathered
- `__tests__/auth-otp-integration.test.js` is **not valid JS** (file begins with `/` and length was 15 bytes; Jest reports `Unterminated regular expression (1:1)`).
- OTP implementation exists:
  - `controllers/otpController.js` exports `sendOtp` and `verifyOtp`.
  - `services/otpService.js` exports `storeOTP(phone, otp)` and `verifyOTP(phone, otp)` using Redis.

## Plan (single stage)
1. Replace `__tests__/auth-otp-integration.test.js` with a valid Jest test that:
   - Mocks Redis (`config/redis`) and DB (`config/db`).
   - Mocks `services/smsService` to deterministically return an OTP.
   - Calls `otpController.sendOtp` and `otpController.verifyOtp` directly with mocked `req/res`.
   - Asserts success payloads and error handling paths.
2. Re-run `cd BACKEND/planbuddy_v9 && npm test`.

## Verification
- Stage 4 PASS only if `auth-otp-integration.test.js` runs (no parser error) and OTP-related assertions pass.

