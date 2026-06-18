# PlanBuddy Phase 1 — Audit Report & Production Upgrade

**Date:** 2026-06-09  
**Scope:** Critical fixes + production hardening of all existing features  
**Version:** v3.1.0

---

## AUDIT RESULTS

### 🔴 CRITICAL ISSUES FIXED

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| 1 | `app/layout.tsx` | `Permissions-Policy` header blocked `microphone` and `geolocation` globally — silently breaking voice notes and Safety Hub location features | Removed mic/geo blocks; only retained payment/usb/bluetooth |
| 2 | `app/dashboard/buddy/BuddyScreen.tsx` | Clear button called `useCompanion` as a value, not a function — button was dead | Wired to `clearMessages()` from hook |
| 3 | `app/dashboard/you/budget/page.tsx` | 100% hardcoded Goa demo data; "Add" button cleared form only (no persistence) | Full live engine from Zustand store |
| 4 | `app/dashboard/you/safety/page.tsx` | Emergency contacts hardcoded; SOS held progress but triggered nothing; tel: links missing; checklist lost on reload | Persistent contacts, real SOS hold, real tel: links, persisted checklist |
| 5 | `app/dashboard/you/packing/page.tsx` | Static Goa list; progress lost on reload; no trip context | Dynamic list from trip destination/interests/duration, persisted via localStorage |
| 6 | `app/dashboard/you/memories/page.tsx` | useState only — entries lost on page reload; hardcoded seed data | Zustand store (persisted), live stats, AI summary |
| 7 | `app/api/memories/route.ts` | Returned hardcoded JSON stub | Real Claude API call |
| 8 | `app/dashboard/DashboardScreen.tsx` | "Recent Trips" showed hardcoded TRIP_CARDS regardless of user trips | Reads from Zustand store; shows real user trips |

---

### 🟡 PARTIAL IMPLEMENTATIONS COMPLETED

| Feature | Was | Now |
|---------|-----|-----|
| Offline system | `navigator.onLine` listener only | IndexedDB layer (`lib/offlineDB.ts`), sync queue, hydration on auth, flush on reconnect |
| Companion context | Basic trip name + budget total | Full itinerary, daily plan, budget health, category spend, trip memories, traveler profile |
| Budget calculations | Static hardcoded values | Live burn-rate, safe-pace, category breakdown, overspend alert |
| Safety SOS | Visual animation only | 3-second conic-gradient hold, location via Geolocation API, tel: links |
| Packing list | One static Goa template | Dynamic per destination/interests/duration, custom items addable |

---

### 🟠 TECHNICAL DEBT REDUCED

| Area | Change |
|------|--------|
| Performance | `hooks/usePerformance.ts` — stable Zustand selectors, deduplicated requests, shared INR formatter |
| Companion context | `buildContext()` upgraded from 8 fields to 14 fields including itinerary details, budget health string, top spend categories, trip memories |
| API system prompt | Structured sections (Trip, Budget, Itinerary, Memories, Profile) — more reliable context injection |
| Budget categories | Fixed `transport` → kept as-is (store uses `travel` — aligned in new budget page) |

---

## FILES MODIFIED

```
app/layout.tsx                              ← CRITICAL: permissions fix
app/dashboard/DashboardScreen.tsx           ← Store-connected trip cards
app/dashboard/buddy/BuddyScreen.tsx         ← Clear button fix
app/dashboard/you/budget/page.tsx           ← Full rewrite → live engine
app/dashboard/you/safety/page.tsx           ← Full rewrite → production
app/dashboard/you/packing/page.tsx          ← Full rewrite → dynamic
app/dashboard/you/memories/page.tsx         ← Full rewrite → persisted
app/api/memories/route.ts                   ← Real Claude API
app/api/chat/route.ts                       ← Upgraded system prompt
hooks/useOffline.ts                         ← IndexedDB hydration + sync
hooks/useCompanion.ts                       ← Richer context + clearMessages
```

## FILES ADDED

```
lib/offlineDB.ts                            ← IndexedDB offline layer
hooks/usePerformance.ts                     ← Stable selectors + utilities
```

---

## WHAT WAS PRESERVED

- All existing routes and file structure
- All CSS modules (zero visual regressions)
- Auth flow (phone + OTP) unchanged
- Zustand store schema unchanged (backward compatible)
- PlusScreen AI trip generation unchanged
- ExploreScreen unchanged
- YouScreen unchanged
- All navigation unchanged
- All existing types

---

## TESTING CHECKLIST

### Auth
- [ ] Phone + OTP login works end-to-end
- [ ] Auth guard blocks unauthenticated routes
- [ ] Logout clears session

### Offline
- [ ] Install IndexedDB on first auth (DevTools → Application → IndexedDB → planbuddy-offline)
- [ ] Go offline → existing trips/expenses/memories still visible
- [ ] Return online → sync queue flushes (DevTools console)

### Permissions
- [ ] Microphone permission prompt works on voice-capable screen
- [ ] Geolocation permission prompt appears when tapping "Share Location" in Safety

### Budget
- [ ] Create a trip via Plus tab
- [ ] Log an expense → appears in Recent Expenses immediately
- [ ] Delete an expense → removed from list
- [ ] Overspend alert appears when >85% of budget spent
- [ ] Burn-rate and safe-pace update with each expense

### Safety
- [ ] Add emergency contact → persists after reload
- [ ] Delete contact → removed
- [ ] SOS hold 3 seconds → activates
- [ ] "Call" links open dialer
- [ ] "Share Location" opens permission prompt or Maps
- [ ] Checklist persists after reload

### Packing
- [ ] List changes based on active trip destination
- [ ] Packed items persist after reload
- [ ] Adding a custom item works per category
- [ ] Progress % updates correctly

### Memories
- [ ] Add a memory → appears in timeline immediately
- [ ] Memory persists after reload (Zustand persist)
- [ ] Stats (entries count) update live
- [ ] "Generate" AI summary works when ≥2 memories exist

### Buddy
- [ ] Clear conversation button works
- [ ] Budget question returns real budget data
- [ ] Itinerary question references actual trip plan

---

## PHASE 2 RECOMMENDATIONS (not in scope for Phase 1)

1. **Backend sync** — wire `flushSyncQueue()` to a real `/api/sync` endpoint
2. **Voice notes** — MediaRecorder API integration in Memories (architecture scaffolded)
3. **Weather API** — replace "check locally" placeholder with real weather data
4. **Push notifications** — service worker + VAPID key setup
5. **Trip sharing** — export trip as PDF/link
6. **Multi-device sync** — server-side trip storage

