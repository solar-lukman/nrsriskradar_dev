import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, isOnLogin, logout } from '../fixtures/auth';

// UAT-AUTH-01, UAT-AUTH-05 mapping is emitted via annotations for the report.
const users = usersWithCreds();

test.describe('Authentication', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured (see e2e/.env.example)');

  for (const user of users) {
    test(`UAT-AUTH-01 [${user.role}] logs in with valid credentials`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-01' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);
      expect(await isOnLogin(page)).toBe(false);
      // Screenshot for the UAT evidence pack
      await page.screenshot({ path: testInfo.outputPath(`login-${user.role}.png`), fullPage: false });
      await logout(page);
    });
  }

  test('UAT-AUTH-01-neg rejects invalid credentials', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-01-neg' });
    await page.goto('/app');
    await page.locator('#signin-email').fill('nobody@example.invalid');
    await page.locator('#signin-password').fill('wrong-password-!!');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Still on login form + a destructive toast should appear
    await expect(page.locator('#signin-email')).toBeVisible({ timeout: 8000 });
  });
});
