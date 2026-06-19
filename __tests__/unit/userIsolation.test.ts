// ============================================================
// Phase 2E: User Isolation Tests
// Verifies that User A's data is never visible to User B.
// ============================================================

export {}; // make this file a module to avoid TS2451 redeclaration

// Mock zustand localStorage persistence
jest.mock('zustand/middleware', () => ({
  persist: (config: unknown) => config,
  createJSONStorage: () => undefined,
}));

// We import the raw store config — reset between each test
let storeModule: typeof import('@/store/appStore');

beforeEach(() => {
  jest.resetModules();
  storeModule = require('@/store/appStore');
});

describe('User Isolation — Phase 2E', () => {
  const USER_A = { phone: '9000000001', token: 'tok-a', createdAt: Date.now(), userId: 'user-a' };
  const USER_B = { phone: '9000000002', token: 'tok-b', createdAt: Date.now(), userId: 'user-b' };

  function makeTrip(override: Record<string, unknown> = {}) {
    return {
      id:        `trip-${Math.random().toString(36).slice(2)}`,
      title:     'Test Trip',
      from:      'Mumbai',
      to:        'Goa',
      startDate: '2026-12-01',
      endDate:   '2026-12-05',
      budget:    20000,
      status:    'planned' as const,
      interests: [],
      days:      [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...override,
    };
  }

  function makeExpense(tripId: string, override: Record<string, unknown> = {}) {
    return {
      id:        `exp-${Math.random().toString(36).slice(2)}`,
      tripId,
      amount:    500,
      category:  'food' as const,
      note:      'Test expense',
      date:      '2026-12-01',
      createdAt: Date.now(),
      synced:    false,
      ...override,
    };
  }

  function makeMemory(tripId: string, override: Record<string, unknown> = {}) {
    return {
      id:          `mem-${Math.random().toString(36).slice(2)}`,
      tripId,
      destination: 'Goa',
      headline:    'Great trip',
      highlights:  ['Amazing beach'],
      totalSpent:  15000,
      daysOnTrip:  5,
      createdAt:   Date.now(),
      ...override,
    };
  }

  test('User A trips are NOT visible to User B', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    // User A logs in and creates a trip
    store.setAuth(USER_A);
    store.addTrip(makeTrip());
    const userATrips = store.getUserTrips();
    expect(userATrips).toHaveLength(1);
    expect(userATrips[0].userId).toBe('user-a');

    // User A logs out
    store.clearUserData();
    store.clearAuth();

    // User B logs in
    store.setAuth(USER_B);
    const userBTrips = store.getUserTrips();

    // CRITICAL: User B must see zero User A trips
    expect(userBTrips).toHaveLength(0);
    userBTrips.forEach((t) => {
      expect(t.userId).not.toBe('user-a');
    });
  });

  test('User A expenses are NOT visible to User B', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    const trip = makeTrip();
    store.addTrip(trip);
    store.addExpense(makeExpense(trip.id));
    expect(store.getUserExpenses()).toHaveLength(1);

    store.clearUserData();
    store.clearAuth();
    store.setAuth(USER_B);

    expect(store.getUserExpenses()).toHaveLength(0);
  });

  test('User A memories are NOT visible to User B', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    const trip = makeTrip();
    store.addTrip(trip);
    store.addMemory(makeMemory(trip.id));
    expect(store.getUserMemories()).toHaveLength(1);

    store.clearUserData();
    store.clearAuth();
    store.setAuth(USER_B);

    expect(store.getUserMemories()).toHaveLength(0);
  });

  test('clearUserData wipes ALL user-owned state fields', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    store.addTrip(makeTrip());
    store.addExpense(makeExpense('trip-1'));
    store.addMemory(makeMemory('trip-1'));
    store.addCompanionMessage({ id: 'm1', role: 'user', content: 'hi', timestamp: Date.now() });

    store.clearUserData();

    const state = useAppStore.getState();
    expect(state.trips).toHaveLength(0);
    expect(state.expenses).toHaveLength(0);
    expect(state.memories).toHaveLength(0);
    expect(state.companionMessages).toHaveLength(0);
    expect(state.activeTripId).toBeNull();
  });

  test('addTrip stamps userId automatically', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    store.addTrip(makeTrip({ userId: undefined })); // no userId supplied

    const trips = useAppStore.getState().trips;
    expect(trips[0].userId).toBe('user-a');
  });

  test('addExpense stamps userId automatically', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    store.addExpense(makeExpense('trip-1', { userId: undefined }));

    const expenses = useAppStore.getState().expenses;
    expect(expenses[0].userId).toBe('user-a');
  });

  test('addMemory stamps userId automatically', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.setAuth(USER_A);
    store.addMemory(makeMemory('trip-1', { userId: undefined }));

    const memories = useAppStore.getState().memories;
    expect(memories[0].userId).toBe('user-a');
  });

  test('getUserTrips returns empty array for unauthenticated user', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();
    store.clearAuth();
    expect(store.getUserTrips()).toHaveLength(0);
    expect(store.getUserExpenses()).toHaveLength(0);
    expect(store.getUserMemories()).toHaveLength(0);
  });

  test('Users only see their own data when both exist in store', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    // Simulate a shared device: User A data stays in persisted store
    store.setAuth(USER_A);
    const tripA = makeTrip({ id: 'trip-a', to: 'Goa' });
    store.addTrip(tripA);

    // Simulate User B logging in on same device without clearUserData (edge case)
    // After auth switch (no clearUserData), strict selectors should still isolate
    store.setAuth(USER_B);
    const tripB = makeTrip({ id: 'trip-b', to: 'Manali' });
    store.addTrip(tripB);

    const userBTrips = store.getUserTrips();
    // User B must only see user-b trips
    userBTrips.forEach((t) => expect(t.userId).toBe('user-b'));
    expect(userBTrips.map((t) => t.id)).not.toContain('trip-a');
  });
});
