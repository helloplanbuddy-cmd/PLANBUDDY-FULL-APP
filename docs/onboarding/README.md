# PlanBuddy — Onboarding & Setup (Frontend)

This document explains how to set up and run the active PlanBuddy app (Next.js) and how to verify the splash → onboarding flow.

## Prerequisites

- Node.js **18+** (recommended 20+)
- npm

> Note: The project `package.json` runs `prisma generate` in `postinstall`. If `prisma` is not available on your system PATH, install dependencies via `npm ci` after ensuring Node/npm are correctly installed.

## Project Overview

PlanBuddy is a **Next.js** application using the `app/` router.

Key routing flow during first launch:
- `app/splash/*` renders the splash
- `hooks/useSplash.ts` navigates to:
  - `/onboarding` if onboarding not completed
  - `/demo-trip-generator` if onboarding completed but demo not seen
  - `/auth/phone` after demo is seen

## Install

From the repo root:

```bash
npm install
```

## Run (Development)

```bash
npm run dev
```

Open the local dev server URL (typically http://localhost:3000).

## Build (Production)

```bash
npm run build
npm run start
```

## Type Check

```bash
npm run type-check
```

## Usage Guide

### Splash → Onboarding verification

1. Clear local storage keys used by the splash navigation:
   - `ONBOARDING_DONE`
   - `DEMO_SEEN`

2. Start the app:

   ```bash
   npm run dev
   ```

3. Confirm the expected navigation:
   - Fresh install / first ever launch → **Onboarding** (`/onboarding`)
   - After onboarding marked done → **Demo generator** (`/demo-trip-generator`)
   - After demo marked seen → **Login** (`/auth/phone`)

### Known frontend fixes applied

The following fixes are intended to prevent blank screens and ensure navigation timing is smooth:

- **CSS containment fix** (`app/globals.css`)
  - Replaced `#app { contain: layout; }` with `#app { isolation: isolate; }`.

- **styled-jsx fix** (`package.json`)
  - Added `styled-jsx` to ensure `<style jsx>` blocks render correctly.

- **Navigation timing buffer** (`hooks/useSplash.ts`)
  - Added a small buffer so navigation happens shortly *after* the fade completes.

## Testing (E2E)

```bash
npm run test:e2e
```

## Troubleshooting

### Blank screen / styles not loading
- Ensure `styled-jsx` is installed (it is listed in `dependencies`).
- Run `npm install` again after pulling changes.

### Splash navigation flashes or ends too early
- Confirm `hooks/useSplash.ts` uses the buffered navigation delay.

---

If you need to modify the onboarding flow, focus on:
- `hooks/useSplash.ts`
- onboarding UI in `app/onboarding/`
- shared components in `app/components/`

