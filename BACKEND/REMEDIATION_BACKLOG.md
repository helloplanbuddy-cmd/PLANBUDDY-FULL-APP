# REMEDIATION_BACKLOG.md
## PlanBuddy v9 Backend — Master Remediation Program v2.0
### Generated: 2026-06-09
### Auditor: Principal Software Architect / Staff Backend Engineer
### Program Target: MVP READY (62/100) → STARTUP READY (80+/100)

---

## EXECUTIVE SUMMARY

The PlanBuddy v9 backend is **already substantially hardened** — the Phase 0
Baseline Report identified 5 critical blockers, all of which are **RESOLVED** in
the current code:

| Phase 0 Blocker | Status | Evidence |
|-----------------|--------|----------|
| bcryptQueue.js = stub | ✅ FIXED | `services/bcryptQueue.js` now uses `crypto.scrypt()` with N=2^14 |
| Missing .dockerignore | ✅ FIXED | `.dockerignore` excludes .env, tests, chaos, logs, tmp_*, debug scripts |
| DB credential leak in logs | ✅ FIXED | `config/db.js` only logs err.code/err.message — no credentials |
| Prometheus metric name mismatches | ✅ FIXED | `utils/monitoring.js` re-exports metricsService via Object.assign |
| Worker db.end() breaks shared pool | ✅ FIXED | `workers/webhook-processor.worker.js` shutdown explicitly skips db.end() |

This document is therefore a **forward-looking remediation backlog** focused on
the remaining 20-30 points of gap between the current state and the STARTUP
READY target (80+/100).

---

## PRIORITISATION LEGEND

- **P0** — Blocks production launch. Must-fix this week.
- **P1** — High. Required for confident public launch.
- **P2** — Medium. Required for the first 90 days of operation.
- **P3** — Low. Quality-of-life and future-proofing.

---

## P0 — CRITICAL (blocks production)

| # | Item | Module | Current State | Target |
|---|------|--------|---------------|--------|
| P0-01 | **Compression middleware missing** | `app.js` | No gzip/br on responses. Wastes ~70% bandwidth on JSON. | Add `compression({ threshold: 1024 })` early in the stack. |
| P0-02 | **Event loop lag metric not exported to Prometheus** | `metricsService.js`, `backpressure.js` | `eventLoopLag` exists in memory only — no scrape. | Export `nodejs_eventloop_lag_seconds` gauge. |
| P0-03 | **No Helmet for standard security headers** | `app.js` | Custom header set in app.js; misses `Cross-Origin-*` family. | Add `helmet()` early in stack with strict CSP. |
| P0-04 | **Health `detailed` endpoint returns placeholder** | `controllers/healthController.js` | `exports.detailed = (req, res) => res.json({ status: 'detailed ok' })` | Wire to actual dependency snapshot. |
| P0-05 | **No centralised input-size cap on query/params** | `middleware/validation.js` | `express.json({ limit: '512kb' })` covers body. Query string unbounded. | Add a query string length cap (e.g., 2kb). |
| P0-06 | **No request timeouts on individual handlers** | `app.js`, `server.js` | `server.setTimeout` set but no per-request timeout enforcement. | Add `req.setTimeout(30_000)` middleware. |
| P0-07 | **CSRF middleware does not run for cookie-based session fall-back** | `middleware/csrfProtection.js` (not read yet) | X-Requested-With only — relies on no SPA. | Verify mobile-app compatibility or add token-based fallback. |
| P0-08 | **No OpenTelemetry or APM integration** | `utils/monitoring.js` | Pino only; no trace export. | Add OTel SDK bootstrap behind feature flag. |
| P0-09 | **No Sentry / error aggregation** | `app.js` | Errors logged but not sent off-host. | Add Sentry in prod only, behind env flag. |
| P0-10 | **No `.npmrc` or supply-chain policy** | repo root | No `npm audit signatures` check in CI. | Add `.npmrc` with `audit-level=high` and a CI job. |

## P1 — HIGH (required for confident launch)

| # | Item | Module | Current State | Target |
|---|------|--------|---------------|--------|
| P1-01 | **Performance: response caching headers absent** | controllers | `Cache-Control` never set. | Add ETag/Last-Modified on idempotent reads. |
| P1-02 | **DB: missing partial indexes for hot paths** | migrations | Some `payment_integrity_log_indexes` migrations exist (190, 196) but not all hot paths. | Add `CREATE INDEX CONCURRENTLY` for `bookings(user_id, status)`, `payments(user_id, status)`. |
| P1-03 | **Backpressure bypasses path check uses prefix-only** | `middleware/backpressure.js` | `req.path.startsWith('/health')` — same mount issue as rateLimit. | Use same isBypassPath() helper as rateLimit.js. |
| P1-04 | **Auth: rate-limit applied to /auth but not to /admin** | `routes/index.js` | Admin routes auth+requireRole but no adminLimiter. | Mount adminLimiter. |
| P1-05 | **JWT: no audience claim validation** | `utils/jwt.js` | `algorithms: ['HS256']` only. | Add `audience`/`issuer` claims + validation. |
| P1-06 | **Pool: statement_timeout not re-set on every pool.connect()** | `config/db.js` | Set inside `transaction()` only. | Document that ad-hoc queries inherit session defaults. |
| P1-07 | **Workers: no shared Postgres advisory lock on queue claim** | `config/queues.js` (not read) | Webhook worker uses `FOR UPDATE SKIP LOCKED` — good. Verify other workers. | Add audit test. |
| P1-08 | **No load test artefacts committed** | repo | `load-test.js`, `load-test-v2.js` exist at root but not under `__tests__/load/`. | Move + commit k6/artillery scripts. |
| P1-09 | **CI: no required-status-checks on PR** | `.github/workflows/ci.yml` | Workflow exists; verify. | Add branch-protection policy. |
| P1-10 | **Logging: redact PII in default request log** | `app.js` | `logger.info` may include `email`, `phone` in trace. | Add field-level redact at logger level. |

## P2 — MEDIUM (90-day hardening)

| # | Item | Module | Current State | Target |
|---|------|--------|---------------|--------|
| P2-01 | **Migrations: 002, 003, 004 — duplicate and confused sequence** | `migrations/002_*.sql`, `003_*`, `004_*` | Multiple "002" and "003" files exist with overlapping concerns. | Consolidate; ensure ordering is deterministic. |
| P2-02 | **Service registry pattern absent** | `services/*` | 30+ services imported ad-hoc. | Document public surface; no god-class yet, but trending. |
| P2-03 | **No circuit-breaker around Razorpay order create** | `services/RazorpayService.js` | `services/circuitBreaker.js` exists but verify integration. | Wrap order.create + order.fetch. |
| P2-04 | **No cache layer for trip availability** | `controllers/bookingController.js` | `checkAvailability` hits DB on every call. | Add Redis read-through with short TTL. |
| P2-05 | **No smoke test script** | `scripts/` | Backup/restore scripts exist, no `smoke.sh`. | Add `scripts/smoke.sh` calling /health + /api/v1/auth. |
| P2-06 | **No Prometheus alerting for webhook dedup rate** | `grafana/prometheus/alerts/` | Alerts exist for some metrics. | Add `webhook_dedup_ratio > 50%` alert. |
| P2-07 | **No weekly secret-rotation job** | `services/` | Only ad-hoc. | Add `rotateWebhookSecret` admin endpoint. |
| P2-08 | **No GDPR data-export endpoint** | `controllers/authController.js` | None. | Add `GET /auth/me/export` returning user PII. |
| P2-09 | **No GDPR delete endpoint** | same | None. | Add `DELETE /auth/me` (soft delete). |
| P2-10 | **No geo-redundancy test** | repo | Single-region config. | Document DR posture. |

## P3 — LOW (housekeeping)

| # | Item | Module | Current State | Target |
|---|------|--------|---------------|--------|
| P3-01 | **Old stub files in repo root** | `analyze-phase-2-results.js`, `SETUP.JS`, `VERIFY-BACKEND.JS`, `verify-server.js`, `quick-repair.js`, `chaos/chaos.js`, `region-manager.js`, `shard-router.js`, `notify-listener.js`, `atomic-engine.js`, `base-worker.js`, `queues.js` | Legacy/diagnostic scripts at root. | Move to `scripts/diagnostics/` or delete if superseded. |
| P3-02 | **Duplicate jest config locations** | `planbuddy_v9/jest.config.js` and root `jest.config.js` | Two configs. | Verify the root one is a delegator. |
| P3-03 | **README is comprehensive but version-stale** | `README.md` | Refers to v9.0.0 — current. | Verify all references. |
| P3-04 | **No `tsconfig.json` enforcement** | `planbuddy_v9/tsconfig.json` | TS only for types; not built. | Document typecheck policy. |
| P3-05 | **`.dockerignore` doesn't exclude `tmp_*.sql` fix files** | `.dockerignore` | Missing. | Add `tmp_*.sql`, `fixed_*.sql`. |
| P3-06 | **No `dangerfile` for PR review** | repo | None. | Optional. |
| P3-07 | **Internal metrics don't include event-loop lag** | `utils/monitoring.js` | Default metrics only. | Add custom `nodejs_eventloop_lag_seconds`. |
| P3-08 | **No `precommit` hook** | repo | None. | Add husky + lint-staged. |

---

## DEFERRABLE / OUT-OF-SCOPE

- Multi-region active-active
- SOC2 Type II
- Webhook signature key rotation
- Mobile SDK
- White-label tenanting

---

## CHANGE LOG ENTRY POLICY

Every file modified under this program MUST:

1. Be recorded in `CHANGELOG.md`
2. Reference the backlog item ID (e.g., `P0-02`)
3. Be tagged with a rollback plan
4. Pass `npm test` and `npm run audit:master`

---
*End of REMEDIATION_BACKLOG.md*
