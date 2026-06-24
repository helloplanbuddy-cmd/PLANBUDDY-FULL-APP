# PlanBuddy Setup (Local / Dev)

## Prereqs
- Node.js (match your CI version)
- npm

## Install
```bash
npm install
```

## Dev
```bash
npm run dev
```

## Build + Start
```bash
npm run build
npm start
```

---

## Notes about the worker-chunk crash
If you reproduce the following error:
```txt
Cannot find module .next/server/vendor-chunks/lib/worker.js
worker thread exited
```
Treat it as a **Next.js generated chunk integrity** problem. Confirm the file exists in the active `.next` directory.

