import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

const users = usersWithCreds();

test.describe('Role-based landing pages (UAT-AUTH-01 landing check)', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test(`[${user.role}] lands on ${user.landing} via /`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-01' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);
      // Navigate to landing (public) — it should auto-redirect authenticated users
      await page.goto('/');
      await page.waitForTimeout(1500);
      const url = new URL(page.url());
      expect.soft(url.pathname, `Expected ${user.role} to land on ${user.landing}`).toBe(user.landing);
      await page.screenshot({ path: testInfo.outputPath(`landing-${user.role}.png`) });
      await logout(page);
    });
  }
});
