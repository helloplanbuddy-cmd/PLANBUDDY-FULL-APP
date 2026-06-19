// e2e/auth.spec.ts — Playwright E2E: Signup & Login Flow

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────

async function fillPhone(page: Page, phone: string) {
  await page.getByLabel(/phone number/i).fill(phone);
}

async function submitPhone(page: Page) {
  await page.getByRole('button', { name: /send otp|continue/i }).click();
}

async function fillOTP(page: Page, otp: string) {
  // OTP input is a single hidden input behind 6 visual cells
  const input = page.locator('input[type="tel"], input[inputmode="numeric"]').first();
  await input.fill(otp);
}

// ── Tests ─────────────────────────────────────────────────

test.describe('Signup & Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/phone');
  });

  test('phone screen renders correctly', async ({ page }) => {
    await expect(page.getByText(/enter your mobile number/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send otp/i })).toBeDisabled();
  });

  test('send OTP button enables on valid phone', async ({ page }) => {
    await fillPhone(page, '9876543210');
    await expect(page.getByRole('button', { name: /send otp/i })).toBeEnabled();
  });

  test('shows error on invalid phone number', async ({ page }) => {
    await fillPhone(page, '1234567890');
    await submitPhone(page);
    await expect(page.getByText(/valid.*mobile|invalid.*number/i)).toBeVisible();
  });

  test('navigates to OTP screen after valid phone submit', async ({ page }) => {
    // Mock the API
    await page.route('/api/auth/send-otp', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ message: 'OTP sent', expiresIn: 300 }) });
    });

    await fillPhone(page, '9876543210');
    await submitPhone(page);
    await expect(page).toHaveURL(/\/auth\/otp/);
  });

  test('OTP screen shows resend timer', async ({ page }) => {
    await page.goto('/auth/otp?phone=9876543210');
    // Timer should be visible (starts counting down)
    await expect(page.getByText(/resend|seconds/i)).toBeVisible();
  });

  test('successful OTP verification redirects to dashboard', async ({ page }) => {
    await page.route('/api/auth/verify-otp', (route) => {
      route.fulfill({
        status: 200,
        body:   JSON.stringify({ userId: 'usr_test', phone: '9876543210', accessToken: 'mock.jwt.token', deviceId: 'dev_test' }),
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await page.goto('/auth/otp?phone=9876543210');
    await fillOTP(page, '654321');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('wrong OTP shows error message', async ({ page }) => {
    await page.route('/api/auth/verify-otp', (route) => {
      route.fulfill({
        status: 401,
        body:   JSON.stringify({ error: 'Incorrect OTP. 4 attempts left.' }),
      });
    });

    await page.goto('/auth/otp?phone=9876543210');
    await fillOTP(page, '000000');
    await expect(page.getByText(/incorrect otp|attempts left/i)).toBeVisible();
  });

  test('dashboard redirects unauthenticated users to login', async ({ page }) => {
    await page.route('/api/auth/session', (route) => {
      route.fulfill({ status: 401, body: JSON.stringify({ error: 'Unauthorized' }) });
    });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/phone/, { timeout: 5000 });
  });
});
