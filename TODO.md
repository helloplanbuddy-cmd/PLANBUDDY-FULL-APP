# TODO - Crash Root Cause Fix (PlanBuddy)

- [ ] Add missing `prisma` devDependency to package.json so `prisma generate` works in postinstall/build.
- [ ] Re-run `npm install` to verify Prisma generation completes (no `'prisma' is not recognized` and no missing `@prisma/client`).
- [ ] Execute clean rebuild: stop dev servers, delete `.next`, `node_modules`, `package-lock.json`, reinstall.
- [ ] Run `npx prisma generate` explicitly and verify it succeeds.
- [ ] Run `npm run dev` and verify Splash → Onboarding navigation without ErrorBoundary.
- [ ] Confirm runtime: no `@prisma/client` missing, no `vendor-chunks/lib/worker.js` missing.
- [ ] Run `npm run build` and `npm run type-check` to ensure no compile/runtime issues remain.

