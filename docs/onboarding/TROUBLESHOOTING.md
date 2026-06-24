# PlanBuddy Troubleshooting — Crash After Splash Navigation

## Symptom
Navigation works for:
- `/`
- `/splash`

But fails when navigating to:
- `/onboarding`

Server crash:
```txt
Cannot find module .next/server/vendor-chunks/lib/worker.js
the worker thread exited
```

## Classification
- **CRITICAL** — server process crashes; route failure.

## Triage Checklist (evidence-first)
1) On the running instance/container, confirm artifact existence:
   - `./.next/server/vendor-chunks/lib/worker.js`
   - `./.next/server/vendor-chunks/lib/`
2) If the file is missing:
   - Treat as **build/bundler artifact mismatch**.
   - Ensure the deployed `.next/` directory is a complete output from the same build that produced the server.
3) Redeploy with clean artifact generation:
   - remove deployed `.next/`
   - run `next build`
   - deploy the full resulting `.next/`

## Post-fix verification
- Verify `/ -> /splash -> /onboarding` no longer crashes.
- If still crashing, collect production stack trace lines *above* the fatal error so the first `require()` frame can be isolated.

