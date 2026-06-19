# API Contract Matrix — Initial Mapping

Date: 2026-06-14

Instructions: This matrix pairs each frontend API call (via `FRONTEND/lib/apiClient.ts` or Next.js API handlers) to the backend route that provides the data or action. Where there is no direct backend counterpart, the row records the gap and recommended remediation.

Legend:
- `FRONTEND` column: caller path (client-side `apiClient` paths or Next API route handlers)
- `BACKEND` column: backend route (planbuddy_v9) or `frontend-only` if handled inside Next.js API handlers
- `STATUS`: OK = mapped, MISSING = no backend route, MISMATCH = route exists but contract differs

| FRONTEND (client/handler) | BACKEND route (planbuddy_v9) | STATUS | Notes / Action |
|---|---:|---:|---|
| POST /api/auth/send-otp (lib/apiClient AuthApi.sendOtp) | frontend-only: `app/api/auth/send-otp/route.ts` | OK (frontend) | Frontend sends OTP and stores hashed OTP via `lib/dbSessionStore` — no direct backend `/auth/send-otp` in planbuddy_v9. If central auth is required, map to backend `/auth/otp` endpoints.
| POST /api/auth/verify-otp | frontend-only: `app/api/auth/verify-otp/route.ts` | OK (frontend) | Frontend issues tokens (JWT) locally. Backend `planbuddy_v9/routes/auth.js` exposes password-based `/auth/login` and token refresh/logout — verify token formats are compatible.
| POST /api/auth/session (refresh) | frontend-only: `app/api/auth/session/route.ts` | OK (frontend) | Session route in frontend may refresh tokens without calling planbuddy backend. Confirm token signing key and refresh token storage are shared if backend and frontend both validate tokens.
| POST /api/auth/logout | frontend-only: `app/api/auth/logout/route.ts` | OK (frontend) | Frontend revokes client session. If backend session invalidation required, add mapping to backend `/auth/logout` (planbuddy_v9/routes/auth.js has `/logout` expecting refresh token payload).
| POST /api/chat | frontend-side streaming API (`app/api/chat/route.ts`) or `lib/apiClient.streamChat` → `${API_BASE}/api/chat` | frontend-only / configurable | Frontend handles AI chat; `lib/apiClient` can forward to external backend if `NEXT_PUBLIC_API_BASE_URL` set. Confirm whether planbuddy_v9 exposes `/api/chat` or backend streaming handler — currently no equivalent in `planbuddy_v9/routes`.
| POST /api/plan and POST /api/demo-plan | frontend-side (`app/api/plan`, `app/api/demo-plan`) or `lib/apiClient.streamAuthPlan/streamDemoPlan` | frontend-only / configurable | Same as chat: handled by Next.js or external AI service. No direct backend counterpart in planbuddy_v9.
| GET/POST /api/memories | frontend-side (`app/api/memories/route.ts`) and `MemoriesApi` | frontend-only | No backend `memories` route in planbuddy_v9 — persisted by frontend Prisma/DB. If central storage needed, implement `/memories` in backend.
| GET /api/health | frontend-side (`app/api/health/route.ts`) | OK (frontend) | Health returns status for frontend; backend exposes `/status` and `/ping` under planbuddy_v9 (see `planbuddy_v9/routes/index.js`). Consider linking frontend `/api/health` to backend `/status` for unified health checks.
| Payment & bookings client calls (via external backend base) | BACKEND: `/payment/create-order`, `/payment/verify`, `/payment/status/:paymentId`, `/bookings`, `/bookings/:bookingId`, `/bookings/:bookingId/cancel` | PARTIAL / OK on backend | planbuddy_v9 provides these payment/booking endpoints (see `planbuddy_v9/routes/index.js`). Ensure `NEXT_PUBLIC_API_BASE_URL` is set to backend base when client calls should reach these endpoints. Confirm authentication contract (JWT shape) matches frontend token generation.

Key mismatches / blockers (action items)
1. Auth contract: Frontend implements OTP-based auth issuing JWTs in Next API routes; backend `planbuddy_v9` exposes password-based `/auth/login` and refresh/logout endpoints. Determine single source-of-truth for auth tokens. If backend must validate tokens issued by frontend, share signing secrets (`JWT_SECRET`) and refresh token handling.
2. JWT claim & secret mismatch: Frontend `FRONTEND/lib/jwt.ts` issues tokens with `iss='planbuddy-api'` and `aud='planbuddy-app'` and reads `JWT_SECRET`/`JWT_REFRESH_SECRET` from its env. Backend `planbuddy_v9/utils/jwt.js` expects `aud=JWT_AUDIENCE` (default `planbuddy-api`) and `iss=JWT_ISSUER` (default `planbuddy-auth`) and uses `env.JWT_SECRET`. These must be aligned (issuer/audience values and secret names/values) for tokens to be mutually verifiable. Recommended action: choose canonical issuer/audience, centralize token signing secrets in a secure vault, and update `FRONTEND/.env` and `BACKEND/planbuddy_v9/config/env.js` accordingly.
2. Many frontend API handlers are `frontend-only` and do not call backend. Decide whether these should be gateway proxies (forwarding to backend) or remain as first-class server-side handlers.
3. Missing server-side endpoints referenced in audit notes: `/api/trips`, `/api/expenses` — these are not present in frontend or backend routes and must be implemented if required by product flows.
4. Path namespaces: frontend uses `/api/*` (Next.js handlers) while backend uses root-level paths (e.g., `/bookings`, `/payment/*`, `/auth/*`). If `NEXT_PUBLIC_API_BASE_URL` is set to point at backend, client code calls like `/api/plan` will translate to `<BACKEND_BASE>/api/plan` — backend currently does not serve `/api/plan`. Either set API_BASE to frontend origin and let Next.js handlers proxy to backend, or add proxying routes or rewrite rules.

Next concrete step (Phase 2 continuation)
- For each frontend handler marked `frontend-only`, inspect its implementation to determine which backend data/actions it needs. Then decide: 1) keep server-side in Next.js (no backend change), or 2) implement corresponding backend endpoints and update `API_BASE` usage.
- Run `node planbuddy_v9/scripts/routeAudit.js` in test mode to produce a full backend route list and enforcement report; attach its output to this matrix.

Prepared by: assistant (initial static contract mapping)

---

## Backend endpoint details (bookings & payments)

- POST `/payment/create-order` (planbuddy_v9/controllers/paymentController.createOrder)
	- Request body: `{ bookingId: string }`
	- Auth: `authenticate` middleware required (user must own booking)
	- Validation: booking exists, booking total amount matches expected, booking.status === 'pending', payment_status === 'unpaid'
	- Response (200): `{ success: true, data: { orderId, amount, currency, keyId, bookingId } }`
	- Idempotency: `idempotency.strict` middleware required (route enforces it in router)

- POST `/payment/verify` (planbuddy_v9/controllers/paymentController.verifyPayment)
	- Request body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, amount?, currency? }`
	- Auth: `authenticate` required
	- Validation: signature verified via `RazorpayService.verifySignature`
	- Response (200): `{ success: true, message, data }` with `data` containing booking/payment info
	- Idempotency: `idempotency.strict` required

- GET `/bookings` and GET `/bookings/:bookingId` (planbuddy_v9/controllers/bookingController)
	- Auth: `authenticate` required
	- Query params: `page`, `limit`, `status` supported for list
	- Response: `{ success: true, data: { bookings: [...], pagination } }` or `{ success: true, data: { booking } }`

- POST `/bookings/:bookingId/cancel` (planbuddy_v9/controllers/bookingController.cancelBooking)
	- Auth: `authenticate` required
	- Body: `{ reason?: string }`
	- Headers: `Idempotency-Key` required (enforced via `idempotency.strict` middleware)
	- Behavior: transactionally claims cancellation and either delegates or initiates refund via RefundService
	- Successful response: `{ success: true, message, data: { booking } }` or structured error with `code` and `message`.

These controller signatures are the authoritative backend contract for bookings & payments; frontend integration must call these endpoints (via `NEXT_PUBLIC_API_BASE_URL`) or proxy to them from Next.js API handlers. Ensure header usage (Idempotency-Key) and authentication tokens are correctly propagated from the browser to backend services.

