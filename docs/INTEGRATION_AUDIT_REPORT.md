# Integration Audit Report — Initial Discovery

Date: 2026-06-14

Summary
-------
- Scope: Full-stack PlanBuddy (BACKEND/ planbuddy_v9, FRONTEND/ Next.js app).
- This report captures a static, evidence-backed inventory and initial blockers discovered during Phase 1 (Discovery). No code modified.

What I inspected (evidence)
- BACKEND/package.json ([BACKEND/package.json](BACKEND/package.json#L1-L30))
- BACKEND/README.md ([BACKEND/README.md](BACKEND/README.md#L1-L40))
- BACKEND/planbuddy_v9/package.json ([BACKEND/planbuddy_v9/package.json](BACKEND/planbuddy_v9/package.json#L1-L80))
- BACKEND/planbuddy_v9/config/env.js ([BACKEND/planbuddy_v9/config/env.js](BACKEND/planbuddy_v9/config/env.js#L1-L400))
- BACKEND/planbuddy_v9/scripts/routeAudit.js ([BACKEND/planbuddy_v9/scripts/routeAudit.js](BACKEND/planbuddy_v9/scripts/routeAudit.js#L1-L400))
- FRONTEND/package.json ([FRONTEND/package.json](FRONTEND/package.json#L1-L200))
- FRONTEND/app/api routes (e.g. [FRONTEND/app/api/auth/send-otp/route.ts](FRONTEND/app/api/auth/send-otp/route.ts#L1-L200))
- FRONTEND/.env.example shows `NEXT_PUBLIC_API_BASE_URL` ([FRONTEND/.env.example](FRONTEND/.env.example#L1-L120)).

Backend Architecture (high-level)
- Node.js + Express (planbuddy_v9)
- Postgres (schema files: [BACKEND/schema-v3.sql](BACKEND/schema-v3.sql))
- Redis + BullMQ for queues and idempotency
- Razorpay for payments
- PM2 / workers (multiple worker entrypoints under `workers/`)
- Centralized env validation at `planbuddy_v9/config/env.js` (fail-fast in production)

Frontend Architecture (high-level)
- Next.js app (app router) — React 19 + Next 15
- Prisma used for local DB models and seeds (`prisma/` + `prisma generate` on postinstall)
- Next.js API routes under `app/api/*` implement auth, chat, plan, memories, demo-plan and more
- Frontend can call an external backend via `NEXT_PUBLIC_API_BASE_URL` (defaults to same-origin)

API Inventory (preliminary)
- Frontend Next API routes (examples):
  - POST /api/auth/send-otp
  - POST /api/auth/verify-otp
  - POST/GET /api/auth/session
  - POST /api/auth/logout
  - POST /api/chat
  - POST /api/plan
  - GET/POST /api/memories
  - POST /api/demo-plan
  - /api/health

- Backend (planbuddy_v9) exposes an Express router under `planbuddy_v9/routes` — a programmatic audit script exists at `planbuddy_v9/scripts/routeAudit.js` which extracts mounted routes and enforcement middleware expectations.

Route Inventory (notes)
- Frontend app routes live in `FRONTEND/app` (app router) and API handlers are in `FRONTEND/app/api/*`.
- Backend route audit utilities exist and should be executed in a controlled environment to enumerate backend routes and enforcement status (`node scripts/routeAudit.js`).

Database Schema Inventory (preliminary)
- Backend schema in [BACKEND/schema-v3.sql](BACKEND/schema-v3.sql) and `planbuddy_v9/migrations/` — requires running migrations against a PostgreSQL instance to validate.
- Frontend uses Prisma (see `FRONTEND/prisma/`) — `prisma generate` and `prisma migrate` must be exercised in CI with correct DATABASE_URL.

Authentication flow (summary)
- Frontend uses JWT + OTP (SMS) flow implemented in Next.js API routes (`/api/auth/*`).
- Backend has its own `JWT_SECRET`, `REFRESH_TOKEN_SECRET` and token validation in `planbuddy_v9/middleware/authenticate` (referenced by `routeAudit.js`).
- env.js requires many production-only secrets (JWT_SECRET, RAZORPAY_*, REDIS_*, INTERNAL_ALLOWED_IPS) — missing or short secrets will fatal-exit in production.

State management flow (summary)
- Frontend: `zustand` used for client state; server session state managed via cookies / tokens returned by `/api/auth/session`.
- Backend: Redis used for sessions, idempotency caches, and BullMQ queues for async work.

Environment variable inventory (key required from static scan)
- Required by backend `planbuddy_v9/config/env.js` (production required):
  - DATABASE_URL
  - REDIS_URL / REDIS_QUEUE_URL (production)
  - JWT_SECRET (min length checks applied)
  - REFRESH_TOKEN_SECRET (production)
  - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
  - CORS_ORIGINS (production)
  - KNOWN_PROXY_IPS / INTERNAL_ALLOWED_IPS (production)

Third-party services (preliminary)
- Razorpay (payments)
- Redis / Upstash (caching, rate-limits)
- Postgres (primary DB)
- Sentry / OpenTelemetry (observability)
- PostHog (analytics) optionally configured in frontend

Security review (initial observations)
- `planbuddy_v9/config/env.js` enforces long `JWT_SECRET` in prod; ensure secrets are rotated and stored in vault.
- Review required for webhook routes to ensure raw body verification (Razorpay) — `routeAudit.js` flags webhooks as special-case.
- Many security-oriented scripts and docs exist; however, production-run checks (env validation, route audit) must be executed to confirm runtime behavior.

Identified gaps & blockers (initial)
- Several frontend feature notes indicate missing server-side endpoints: `/api/trips`, `/api/expenses` (per PHASE2 report).
- Backend requires many env vars that are not present in the repository — provisioning required before running in production or running migrations.
- Route enforcement audit is available but not yet executed in runtime — requires a dev/test env to run `node planbuddy_v9/scripts/routeAudit.js`.
- Migrations need a live Postgres DB to validate; cannot be verified statically.

Next steps (Phase 2 mapping / verification)
1. Execute backend route audit (`node planbuddy_v9/scripts/routeAudit.js`) in test mode to enumerate routes and enforcement issues.
2. Generate a complete API contract matrix by mapping each frontend API handler and client-side call to the backend route it depends on.
3. Provision ephemeral Postgres + Redis (local or Docker) to run migrations and execute integration tests.
4. Run `npm install` and `npm test` for both frontend and backend in test/dev environment.

Status
------
- Discovery (Phase 1): PARTIAL — static audit complete, runtime checks pending.

Evidence notes
--------------
- All items in this report reference files that exist in the workspace. Execute the scripts referenced (routeAudit, migration checks) to produce deeper, evidence-backed results.

Prepared by: Automated initial discovery (assistant)
