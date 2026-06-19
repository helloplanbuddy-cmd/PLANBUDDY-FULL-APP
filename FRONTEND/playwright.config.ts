// playwright.config.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:        './e2e',
  fullyParallel:  true,
  forbidOnly:     !!process.env.CI,
  retries:        process.env.CI ? 2 : 0,
  workers:        process.env.CI ? 1 : undefined,
  reporter:       process.env.CI ? 'github' : 'html',

  use: {
    baseURL:       process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace:         'on-first-retry',
    screenshot:    'only-on-failure',
    video:         'on-first-retry',
  },

  projects: [
    {
      name:  'Mobile Chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'Mobile Safari',
      use:  { ...devices['iPhone 14'] },
    },
    ...(process.env.CI ? [] : [{
      name: 'Desktop Chrome',
      use:  { ...devices['Desktop Chrome'] },
    }]),
  ],

  webServer: process.env.CI ? {
    command:  'npm run build && npm run start',
    url:      'http://localhost:3000',
    timeout:  120_000,
    reuseExistingServer: false,
  } : undefined,
});
