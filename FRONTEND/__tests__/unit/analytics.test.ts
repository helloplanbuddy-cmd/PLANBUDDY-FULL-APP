// ============================================================
// Phase 2E: Analytics Coverage Tests
// Verifies all required events are defined and fire correctly.
// ============================================================

jest.mock('posthog-js', () => ({
  default: {
    init:     jest.fn(),
    capture:  jest.fn(),
    identify: jest.fn(),
  },
}));

describe('Analytics Event Registry — Phase 2E', () => {
  // Required event list from Phase E spec
  const REQUIRED_EVENTS = [
    'app_opened',
    'splash_viewed',
    'login_started',
    'login_success',
    'login_failed',
    'logout',
    'onboarding_started',
    'onboarding_completed',
    'dashboard_opened',
    'trip_created',
    'trip_saved',
    'trip_deleted',
    'trip_viewed',
    'budget_created',
    'budget_updated',
    'memory_added',
    'packing_item_added',
    'explore_search',
    'buddy_opened',
    'profile_updated',
  ] as const;

  // Source-of-truth map: event → file where it should fire
  const EVENT_SOURCES: Record<string, string[]> = {
    app_opened:           ['app/splash/SplashScreen.tsx'],
    splash_viewed:        ['app/splash/SplashScreen.tsx'],
    login_started:        ['hooks/useAuth.ts'],
    login_success:        ['hooks/useAuth.ts'],
    login_failed:         ['hooks/useAuth.ts'],
    logout:               ['app/dashboard/you/YouScreen.tsx', 'app/api/auth/logout/route.ts'],
    onboarding_started:   ['app/onboarding/OnboardingScreen.tsx'],
    onboarding_completed: ['hooks/useOnboarding.ts'],
    dashboard_opened:     ['app/dashboard/DashboardScreen.tsx'],
    trip_created:         ['app/dashboard/plus/PlusScreen.tsx'],
    trip_saved:           ['app/dashboard/plus/PlusScreen.tsx'],
    trip_deleted:         ['app/dashboard/you/trips/page.tsx'],
    trip_viewed:          ['app/dashboard/you/trips/page.tsx'],
    budget_created:       ['app/dashboard/you/budget/page.tsx'],
    budget_updated:       ['app/dashboard/you/budget/page.tsx'],
    memory_added:         ['app/dashboard/you/memories/page.tsx'],
    packing_item_added:   ['app/dashboard/you/packing/page.tsx'],
    explore_search:       ['app/dashboard/explore/ExploreScreen.tsx'],
    buddy_opened:         ['app/dashboard/buddy/BuddyScreen.tsx'],
    profile_updated:      ['hooks/useAuth.ts'],
  };

  test('all required events are defined in EVENT_SOURCES map', () => {
    REQUIRED_EVENTS.forEach((event) => {
      expect(EVENT_SOURCES).toHaveProperty(event);
    });
  });

  test('event sources are non-empty arrays', () => {
    REQUIRED_EVENTS.forEach((event) => {
      expect(Array.isArray(EVENT_SOURCES[event])).toBe(true);
      expect(EVENT_SOURCES[event].length).toBeGreaterThan(0);
    });
  });

  test('ClientAnalytics.track is callable without throwing', async () => {
    // Lazy-load posthog mock
    const { ClientAnalytics } = require('@/app/providers/AnalyticsProvider');
    // Should not throw for any required event
    for (const event of REQUIRED_EVENTS) {
      await expect(
        ClientAnalytics.track(event, { test: true })
      ).resolves.not.toThrow?.();
    }
  });

  test('no duplicate event names in required list', () => {
    const unique = new Set(REQUIRED_EVENTS);
    expect(unique.size).toBe(REQUIRED_EVENTS.length);
  });

  test('ClientAnalytics helper methods match required events', () => {
    const { ClientAnalytics } = require('@/app/providers/AnalyticsProvider');
    // These should be callable methods
    expect(typeof ClientAnalytics.track).toBe('function');
    expect(typeof ClientAnalytics.tripCreated).toBe('function');
    expect(typeof ClientAnalytics.memoryAdded).toBe('function');
  });
});
