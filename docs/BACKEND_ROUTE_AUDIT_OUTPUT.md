# Backend Route Audit Output (routeAudit.js — NODE_ENV=test)

```
{"level":30,"time":1781450251659,"pid":11012,"hostname":"LAPTOP-OFP871K4","msg":"[db] Pool sizing: DB_POOL_MAX=10 PM2_INSTANCES=1 = 10 total connections (PG max_connections=100, 80% limit=80)"}

=== Route Enforcement Audit Summary ===
GET    /ping                                         NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /status                                       NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
POST   /register                                     NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
POST   /login                                        NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
POST   /refresh                                      NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
POST   /logout                                       NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /me                                           NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /bookings                                     VERIFIED
GET    /bookings/:bookingId                          VERIFIED
POST   /bookings/:bookingId/cancel                   VERIFIED
GET    /admin/bookings                               VERIFIED
POST   /payment/create-order                         VERIFIED
POST   /payment/verify                               VERIFIED
GET    /payment/status/:paymentId                    VERIFIED
POST   /admin/payments/:paymentId/reconcile          VERIFIED
POST   /payment/webhook/razorpay                     VERIFIED
GET    /trips/:tripId/availability                   NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /trips/:tripId/slots                          NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/health/live                         NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/health/ready                        NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/health/readiness                    NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/health/detailed                     NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/health/production                   NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
POST   /internal/health/check-integrity              NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/metrics/queues                      NOT_CHECKED
    - no enforcement expectations for this route in the current audit model
GET    /internal/metrics                             NOT_CHECKED
    - no enforcement expectations for this route in the current audit model

Audit completion status: PASS (some routes not checked)
{"level":50,"time":1781450253003,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253010,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253011,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253011,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253012,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253012,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":50,"time":1781450253012,"pid":11012,"hostname":"LAPTOP-OFP871K4","service":"rateLimit","err":"Rate limit Redis not ready (status=connecting)","msg":"[rateLimit] WARN: Could not create RedisStore - non-critical limiters will use MemoryStore"}
{"level":40,"time":1781450253127,"pid":11012,"hostname":"LAPTOP-OFP871K4","requestId":"route-audit","userId":"user-1","userRole":"user","required":["admin"],"path":"/admin/bookings","msg":"[auth] Authorization failure - insufficient role"}
{"level":40,"time":1781450253128,"pid":11012,"hostname":"LAPTOP-OFP871K4","requestId":"route-audit","userId":"user-1","userRole":"user","required":["admin"],"path":"/admin/payments/:paymentId/reconcile","msg":"[auth] Authorization failure - insufficient role"}
```
