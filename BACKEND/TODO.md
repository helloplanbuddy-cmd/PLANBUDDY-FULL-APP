# TODO - Root-cause driven test failure fixes

- [ ] Update `planbuddy_v9/__tests__/bookingCancellationRefund.unit.test.js`:
  - [ ] Mock `db.transaction` so controller’s transaction callback runs
  - [ ] Provide fake `client.query` results matching controller SQL branches
  - [ ] Ensure assertions stay strict and unchanged

- [ ] Update `planbuddy_v9/config/rateLimitRedis.js`:
  - [ ] Prevent real Redis connection when `NODE_ENV === 'test'`

- [ ] Run `npm test` (via repo’s package.json in `planbuddy_v9`)
  - [ ] Capture: total suites, passed, failed
  - [ ] Capture: remaining open handles / redis warnings
  - [ ] Confirm booking cancellation refund tests pass

- [ ] Report modified files + exact reasons

