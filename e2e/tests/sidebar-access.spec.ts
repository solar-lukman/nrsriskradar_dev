import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, isAccessDenied, logout } from '../fixtures/auth';

const users = usersWithCreds();

test.describe('Sidebar / route access matrix (UAT-AUTH-05, UAT-AUTH-06)', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test(`[${user.role}] can open all allowed routes`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-06' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);
      for (const p of user.allowedPaths) {
        await page.goto(p);
        await page.waitForTimeout(800);
        const denied = await isAccessDenied(page);
        expect.soft(denied, `${user.role} was denied on allowed path ${p}`).toBe(false);
      }
      await logout(page);
    });

    test(`[${user.role}] is blocked from forbidden routes`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-05' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);
      for (const p of user.forbiddenPaths) {
        await page.goto(p);
        await page.waitForTimeout(800);
        const denied = await isAccessDenied(page);
        // Accept either an AccessDenied screen OR a redirect away from the path
        const stillHere = new URL(page.url()).pathname === p;
        expect.soft(
          denied || !stillHere,
          `${user.role} unexpectedly reached forbidden path ${p}`,
        ).toBe(true);
      }
      await logout(page);
    });
  }
});
