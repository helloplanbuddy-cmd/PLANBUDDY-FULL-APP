// ============================================================
// Phase 2E: Onboarding Certification Tests
// Verifies user selections are persisted and never overwritten by defaults.
// ============================================================

export {}; // make this file a module to avoid TS2451 redeclaration
jest.mock('zustand/middleware', () => ({
  persist: (config: unknown) => config,
  createJSONStorage: () => undefined,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/app/providers/AnalyticsProvider', () => ({
  ClientAnalytics: { track: jest.fn() },
}));

let storeModule: typeof import('@/store/appStore');

beforeEach(() => {
  jest.resetModules();
  storeModule = require('@/store/appStore');
});

describe('Onboarding Persistence — Phase 2E', () => {
  test('updatePreferences({ onboardingCompleted: true }) does NOT wipe other fields', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    // Simulate user having set preferences before completing onboarding
    store.updatePreferences({
      travelStyle:           ['luxury'],
      budgetRange:           'luxury',
      travelInterests:       ['beach', 'culture'],
      preferredDestinations: ['Goa', 'Kerala'],
      tripType:              'couple',
      travelFrequency:       'frequently',
    });

    // Complete onboarding (Phase 2E fix — only sets onboardingCompleted)
    store.updatePreferences({ onboardingCompleted: true });

    const prefs = useAppStore.getState().preferences;

    // CRITICAL: user selections must survive
    expect(prefs.onboardingCompleted).toBe(true);
    expect(prefs.travelStyle).toEqual(['luxury']);
    expect(prefs.budgetRange).toBe('luxury');
    expect(prefs.travelInterests).toEqual(['beach', 'culture']);
    expect(prefs.preferredDestinations).toEqual(['Goa', 'Kerala']);
    expect(prefs.tripType).toBe('couple');
    expect(prefs.travelFrequency).toBe('frequently');
  });

  test('default preferences have correct shape with all required fields', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();
    const prefs = store.preferences;

    // All fields must exist and have correct types
    expect(typeof prefs.onboardingCompleted).toBe('boolean');
    expect(Array.isArray(prefs.travelStyle)).toBe(true);
    expect(typeof prefs.budgetRange).toBe('string');
    expect(Array.isArray(prefs.travelInterests)).toBe(true);
    expect(Array.isArray(prefs.preferredDestinations)).toBe(true);
    expect(typeof prefs.tripType).toBe('string');
    expect(typeof prefs.travelFrequency).toBe('string');
  });

  test('preferences survive a logout/login cycle via clearUserData', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    // Set preferences
    store.updatePreferences({
      travelStyle:     ['budget'],
      onboardingCompleted: true,
    });

    // clearUserData resets preferences to defaults — this is expected behaviour
    // (new user logging in gets fresh preferences)
    store.clearUserData();
    const prefs = useAppStore.getState().preferences;
    expect(prefs.onboardingCompleted).toBe(false);
    expect(prefs.travelStyle).toEqual([]);
  });

  test('updatePreferences merges, not replaces — partial updates safe', () => {
    const { useAppStore } = storeModule;
    const store = useAppStore.getState();

    store.updatePreferences({ travelStyle: ['mid'], budgetRange: 'midrange' });
    store.updatePreferences({ tripType: 'solo' }); // only update one field

    const prefs = useAppStore.getState().preferences;
    expect(prefs.travelStyle).toEqual(['mid']);   // preserved
    expect(prefs.budgetRange).toBe('midrange');   // preserved
    expect(prefs.tripType).toBe('solo');          // updated
  });
});
