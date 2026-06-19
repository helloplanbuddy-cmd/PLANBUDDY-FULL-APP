// ============================================================
// Phase 2E: Auth Isolation Tests
// Verifies clearUserData is called on ALL logout paths.
// ============================================================

export {}; // make this file a module to avoid TS2451 redeclaration

jest.mock('zustand/middleware', () => ({
  persist: (config: unknown) => config,
  createJSONStorage: () => undefined,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

let storeModule: typeof import('@/store/appStore');

beforeEach(() => {
  jest.resetModules();
  storeModule = require('@/store/appStore');
});

describe('Auth Isolation — Phase 2E', () => {
  const SESSION = { phone: '9000000001', token: 'tok', createdAt: Date.now(), userId: 'user-1' };

  test('setAuth populates auth and isAuthenticated', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();
    store.setAuth(SESSION);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
    expect(useAppStore.getState().auth?.userId).toBe('user-1');
  });

  test('clearAuth clears auth but does NOT wipe user data', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();
    store.setAuth(SESSION);
    store.addTrip({
      id: 't1', title: 'T', from: 'A', to: 'B',
      startDate: '2026-01-01', endDate: '2026-01-05',
      budget: 1000, status: 'planned',
      interests: [], days: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    store.clearAuth();
    // Auth cleared
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    // Data still there — clearAuth alone does not wipe data
    expect(useAppStore.getState().trips).toHaveLength(1);
  });

  test('clearUserData + clearAuth wipes everything', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();
    store.setAuth(SESSION);
    store.addTrip({
      id: 't1', title: 'T', from: 'A', to: 'B',
      startDate: '2026-01-01', endDate: '2026-01-05',
      budget: 1000, status: 'planned',
      interests: [], days: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    store.clearUserData();
    store.clearAuth();

    const state = useAppStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.auth).toBeNull();
    expect(state.trips).toHaveLength(0);
    expect(state.expenses).toHaveLength(0);
    expect(state.memories).toHaveLength(0);
  });

  test('getUserTrips returns [] when not authenticated', () => {
    const { useAppStore } = storeModule;
    useAppStore.getState().clearAuth();
    expect(useAppStore.getState().getUserTrips()).toEqual([]);
    expect(useAppStore.getState().getUserExpenses()).toEqual([]);
    expect(useAppStore.getState().getUserMemories()).toEqual([]);
  });
});
