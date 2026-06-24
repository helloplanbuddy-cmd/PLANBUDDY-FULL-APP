# PlanBuddy Onboarding (Developer / Operator)

This folder contains onboarding documentation for the **PlanBuddy** Next.js application and its runtime crash debugging context.

## Contents
- `README-onboarding.md` — this file
- `SETUP.md` — local setup and run commands
- `USAGE.md` — how to operate key flows
- `TROUBLESHOOTING.md` — incident triage guide for the worker-chunk crash

---

## Quick Start (Local)
See `SETUP.md`.

---

## Operational Context: Crash During `/splash` → `/onboarding`
Fatal error observed:
```txt
Cannot find module .next/server/vendor-chunks/lib/worker.js
the worker thread exited
```

Primary engineering guidance:
- treat this as a **runtime-generated artifact / bundler chunk integrity** problem
- validate presence of the expected file on the running instance

Full triage steps are in `TROUBLESHOOTING.md`.

