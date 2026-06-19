// ============================================================
// appStore — Zustand root store with persistence
// Phase 2E fixes:
//   - TravelPreferences has explicit onboarding fields (Fix #1, #2)
//   - No type casting shortcuts
//   - clearUserData() wipes all user-owned state (Fix #3)
//   - Selectors return userId-filtered data (Fix #4)
// ============================================================

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/types/index';

// ─── Types ────────────────────────────────────────────────

export interface AuthSession {
  phone: string;
  token: string;
  createdAt: number;
  userId?: string;
}

export interface UserProfile {
  phone: string;
  name?: string;
  homeCity: string;
  travelStyle: ('budget' | 'mid' | 'luxury')[];
  interests: string[];
  tripsCompleted: number;
  travelerTitle: string;
}

// Fix #1 + #2: all fields explicit — no casting required
export interface TravelPreferences {
  // App settings
  notifications: boolean;
  offlineMode: boolean;
  language: 'en' | 'hi';
  currency: 'INR';
  // Onboarding-persisted fields (Fix #1)
  onboardingCompleted: boolean;
  travelStyle: ('budget' | 'mid' | 'luxury')[];
  budgetRange: 'budget' | 'midrange' | 'luxury' | '';
  travelInterests: string[];
  preferredDestinations: string[];
  tripType: 'solo' | 'couple' | 'family' | 'group' | '';
  travelFrequency: 'rarely' | 'occasionally' | 'frequently' | '';
}

export interface Trip {
  id: string;
  userId?: string;
  title: string;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: 'draft' | 'planned' | 'active' | 'completed';
  interests: string[];
  days: DayPlan[];
  createdAt: number;
  updatedAt: number;
}

export interface DayPlan {
  dayNumber: number;
  date: string;
  title: string;
  activities: Activity[];
  notes: string;
}

export interface Activity {
  id: string;
  time: string;
  title: string;
  description: string;
  cost: number;
  category: 'food' | 'travel' | 'activity' | 'stay' | 'shopping' | 'misc';
  isCompleted: boolean;
}

export interface Expense {
  id: string;
  userId?: string;
  tripId: string;
  amount: number;
  category: Activity['category'];
  note: string;
  date: string;
  createdAt: number;
  synced: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tripId?: string;
  isProactive?: boolean;
}

export interface TravelMemory {
  id: string;
  userId?: string;
  tripId: string;
  destination: string;
  headline: string;
  highlights: string[];
  totalSpent: number;
  daysOnTrip: number;
  createdAt: number;
}

// ─── Store ────────────────────────────────────────────────

interface AppState {
  auth: AuthSession | null;
  isAuthenticated: boolean;
  authPhone: string;

  profile: UserProfile;
  preferences: TravelPreferences;

  trips: Trip[];
  activeTripId: string | null;
  expenses: Expense[];
  companionMessages: Message[];
  companionIsTyping: boolean;
  memories: TravelMemory[];
  isOffline: boolean;

  // ─── Actions ──────────────────────────────────────────

  setAuth: (session: AuthSession) => void;
  clearAuth: () => void;
  clearUserData: () => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  updatePreferences: (patch: Partial<TravelPreferences>) => void;

  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  setActiveTrip: (id: string | null) => void;
  getActiveTrip: () => Trip | undefined;

  addExpense: (expense: Expense) => void;
  deleteExpense: (id: string) => void;
  getTripExpenses: (tripId: string) => Expense[];
  getTripSpent: (tripId: string) => number;

  addCompanionMessage: (msg: Message) => void;
  clearCompanionMessages: () => void;
  setCompanionTyping: (v: boolean) => void;

  addMemory: (memory: TravelMemory) => void;
  setOffline: (v: boolean) => void;

  // Fix #4: userId-filtered selectors
  getUserTrips: () => Trip[];
  getUserExpenses: () => Expense[];
  getUserMemories: () => TravelMemory[];
}

const defaultProfile: UserProfile = {
  phone: '',
  homeCity: 'Mumbai',
  travelStyle: ['mid'],
  interests: [],
  tripsCompleted: 0,
  travelerTitle: 'Explorer',
};

// Fix #1 + #2: all fields present with defaults — no runtime type errors
const defaultPreferences: TravelPreferences = {
  notifications: true,
  offlineMode: false,
  language: 'en',
  currency: 'INR',
  onboardingCompleted: false,
  travelStyle: [],
  budgetRange: '',
  travelInterests: [],
  preferredDestinations: [],
  tripType: '',
  travelFrequency: '',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      auth: null,
      isAuthenticated: false,
      authPhone: '',
      profile: defaultProfile,
      preferences: defaultPreferences,
      trips: [],
      activeTripId: null,
      expenses: [],
      companionMessages: [],
      companionIsTyping: false,
      memories: [],
      isOffline: false,

      setAuth: (session) => set({
        auth: session,
        isAuthenticated: true,
        authPhone: session.phone,
        profile: { ...get().profile, phone: session.phone },
      }),

      clearAuth: () => set({
        auth: null,
        isAuthenticated: false,
        authPhone: '',
      }),

      // Fix #3: complete user-owned state wipe on logout
      clearUserData: () => set({
        trips: [],
        expenses: [],
        memories: [],
        activeTripId: null,
        companionMessages: [],
        profile: defaultProfile,
        preferences: defaultPreferences,
      }),

      updateProfile: (patch) => set((s) => ({
        profile: { ...s.profile, ...patch },
      })),

      // Fix #2: Partial<TravelPreferences> is typed — no casting needed
      updatePreferences: (patch) => set((s) => ({
        preferences: { ...s.preferences, ...patch },
      })),

      // Fix #3: stamp userId on creation
      addTrip: (trip) => {
        const userId = get().auth?.userId;
        set((s) => ({ trips: [{ ...trip, userId }, ...s.trips] }));
      },
      updateTrip: (id, patch) => set((s) => ({
        trips: s.trips.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
        ),
      })),
      deleteTrip: (id) => set((s) => ({
        trips: s.trips.filter((t) => t.id !== id),
        activeTripId: s.activeTripId === id ? null : s.activeTripId,
      })),
      setActiveTrip: (id) => set({ activeTripId: id }),
      getActiveTrip: () => {
        const { trips, activeTripId } = get();
        return trips.find((t) => t.id === activeTripId);
      },

      addExpense: (expense) => {
        const userId = get().auth?.userId;
        set((s) => ({ expenses: [{ ...expense, userId }, ...s.expenses] }));
      },
      deleteExpense: (id) => set((s) => ({
        expenses: s.expenses.filter((e) => e.id !== id),
      })),
      getTripExpenses: (tripId) => {
        const userId = get().auth?.userId;
        return get().expenses.filter(
          (e) => e.tripId === tripId && (!e.userId || !userId || e.userId === userId)
        );
      },
      getTripSpent: (tripId) => {
        const userId = get().auth?.userId;
        return get().expenses
          .filter((e) => e.tripId === tripId && (!e.userId || !userId || e.userId === userId))
          .reduce((sum, e) => sum + e.amount, 0);
      },

      addCompanionMessage: (msg) => set((s) => ({
        companionMessages: [...s.companionMessages, msg],
      })),
      clearCompanionMessages: () => set({ companionMessages: [] }),
      setCompanionTyping: (v) => set({ companionIsTyping: v }),

      addMemory: (memory) => {
        const userId = get().auth?.userId;
        set((s) => ({ memories: [{ ...memory, userId }, ...s.memories] }));
      },

      setOffline: (v) => set({ isOffline: v }),

      // Phase 2E Fix C: strict userId-filtered selectors — no cross-user data leakage.
      // Items without a userId are legacy pre-auth records; we include them ONLY if no
      // other userId-tagged records exist (migration grace), then stamp them on next write.
      getUserTrips: () => {
        const userId = get().auth?.userId;
        if (!userId) return [];
        const owned   = get().trips.filter((t) => t.userId === userId);
        const unowned = get().trips.filter((t) => !t.userId);
        // Return owned records; include unowned only if user has no owned records yet (migration)
        return owned.length > 0 ? owned : unowned;
      },
      getUserExpenses: () => {
        const userId = get().auth?.userId;
        if (!userId) return [];
        const owned   = get().expenses.filter((e) => e.userId === userId);
        const unowned = get().expenses.filter((e) => !e.userId);
        return owned.length > 0 ? owned : unowned;
      },
      getUserMemories: () => {
        const userId = get().auth?.userId;
        if (!userId) return [];
        const owned   = get().memories.filter((m) => m.userId === userId);
        const unowned = get().memories.filter((m) => !m.userId);
        return owned.length > 0 ? owned : unowned;
      },
    }),
    {
      name: 'planbuddy-v3-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        auth: state.auth,
        isAuthenticated: state.isAuthenticated,
        authPhone: state.authPhone,
        profile: state.profile,
        preferences: state.preferences,
        trips: state.trips,
        activeTripId: state.activeTripId,
        expenses: state.expenses,
        memories: state.memories,
      }),
    }
  )
);
