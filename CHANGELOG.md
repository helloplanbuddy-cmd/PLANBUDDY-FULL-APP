# PlanBuddy Changelog

## v3.1.0 — Phase 1 Production Hardening (2026-06-09)

### 🔴 Critical Fixes
- **SECURITY/PERMISSION**: Removed blanket `microphone=()` and `geolocation=()` from `Permissions-Policy` header — these were silently blocking voice notes and Safety location features in all browsers
- **BUG**: Fixed dead "Clear conversation" button in BuddyScreen (was referencing hook as value instead of calling `clearMessages()`)
- **BUG**: Budget "Add" button was clearing the form only — now writes real expense to Zustand store

### ✨ Features Upgraded to Production

#### Offline System (lib/offlineDB.ts + hooks/useOffline.ts)
- Added IndexedDB persistence layer with stores for trips, expenses, memories, notes, hotels, emergency contacts, sync queue
- Offline data hydration on first authenticated load
- Background sync queue flushes pending operations when connection returns
- Conflict resolution strategy in place (last-write-wins, Phase 2 merge)

#### Budget Tracker (you/budget/page.tsx)
- Removed all hardcoded Goa demo data
- Live calculations from Zustand expense store
- Real burn-rate (`₹X/day spent`) and safe-pace (`₹Y/day remaining`)
- Category breakdown from actual transactions
- Overspend alert at 85% and 100% budget consumed
- Delete expense functionality
- Empty state with CTA to create a trip

#### Safety Hub (you/safety/page.tsx)
- Emergency contacts now persistent via localStorage (add/delete)
- Pre-trip checklist persists across sessions
- SOS hold uses requestAnimationFrame conic-gradient progress (3s)
- "Share Location" uses real Geolocation API + Web Share / Maps fallback
- All "Call" buttons use real `tel:` href links
- Geolocation error messages with actionable guidance

#### Packing Assistant (you/packing/page.tsx)
- Dynamic list generation based on: destination, trip duration, interests
- Beach/Mountain/Heritage-specific items automatically included
- Packed state persists per trip via localStorage
- Custom item addition per category
- Reads active trip from Zustand store

#### Travel Memories (you/memories/page.tsx)
- Entries now persist in Zustand store (survive reload)
- Seed data removed — starts empty for real users
- Live stats: real entry count, trip count, unique destinations
- Trip filter dropdown uses real trips from store
- AI Trip Rewind summary via real `/api/memories` Claude call (≥2 entries)
- Mood encoded alongside note text in storage

#### AI Companion (Buddy)
- Context builder upgraded from 8 → 14 fields
- Now injects: full itinerary, today's plan with times/costs, budget health string, top spend categories, recent trip memories, traveler interests
- System prompt restructured with clear sections for reliable context access
- `clearMessages` properly exported and wired to clear button

#### Dashboard (DashboardScreen.tsx)
- "Recent Trips" section now reads from Zustand store
- Shows real user trips with real status, destination, duration
- Empty state shown when no trips created yet
- Status color coding from store data

### 🔧 Architecture Additions
- `lib/offlineDB.ts` — IndexedDB abstraction (get/put/delete/getAll/getByIndex/syncQueue)
- `hooks/usePerformance.ts` — stable Zustand selectors, deduplicated request hook, INR formatter

### ⬆️ Upgrades
- `/api/memories/route.ts` — now calls real Claude API (was returning empty stub)
- `/api/chat/route.ts` — system prompt structured into sections, full trip context

---

## v3.0.0 — Auth Flow Integration
- TSX auth screens with full FSM
- Phone validation, OTP grid, lockout, countdown timers
- Auth-guarded dashboard routing

## v2.0.0 — v6.1 Security Upgrade
- API key moved to environment variable
- Hardcoded OTP removed → Twilio integration
- Rate limiting + brute-force OTP protection
- ErrorBoundary, OfflineBanner, skeleton loaders

## v1.0.0 — Next.js Migration
- HTML → Next.js 14 migration
- Zustand store
- Smart Trip Intelligence Dashboard merged
