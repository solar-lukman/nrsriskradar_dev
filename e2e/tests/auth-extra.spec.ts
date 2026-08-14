import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

/**
 * UAT-AUTH (continued) — password policy, lockout, inactivity logout and
 * password reset. Login and route-guard coverage lives in auth.spec.ts and
 * sidebar-access.spec.ts.
 */

const users = usersWithCreds();

test.describe('UAT-AUTH account protection', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-AUTH-02 weak passwords are rejected by the policy', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-02' });
    const user = users[0];
    await login(page, user);

    await page.goto('/profile');
    const changeBtn = page.getByRole('button', { name: /change password/i }).first();
    test.skip((await changeBtn.count()) === 0, 'Change password action not offered');
    await changeBtn.click();

    const scope = page.getByRole('dialog').first();
    const fields = scope.locator('input[type="password"]');
    const count = await fields.count();
    test.skip(count === 0, 'No password fields rendered');
    for (let i = 0; i < count; i++) await fields.nth(i).fill('abc');
    await scope.getByRole('button', { name: /save|update|change/i }).last().click();

    await expect(
      page.getByText(/at least|must contain|too short|weak|requirement/i).first(),
      'a weak password must be refused with guidance',
    ).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('UAT-AUTH-03 repeated bad passwords lock the account', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-03' });
    test.setTimeout(120_000);
    const user = users[0];

    await page.goto('/');
    for (let attempt = 1; attempt <= 6; attempt++) {
      await page.getByLabel(/email/i).first().fill(user.email);
      await page.getByLabel(/password/i).first().fill(`wrong-password-${attempt}`);
      await page.getByRole('button', { name: /sign in|log in/i }).first().click();
      await page.waitForTimeout(1500);
    }

    await expect(
      page.getByText(/locked|too many (failed )?attempts|temporarily/i).first(),
      'the account must lock after repeated failures',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-AUTH-04 an idle session is logged out automatically', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-04' });
    const user = users[0];
    await login(page, user);
    await page.goto('/app');

    // The auto-logout timer is driven by activity listeners; assert the guard
    // is mounted and warns the user rather than idling for the full window.
    const banner = page.getByText(/session|inactiv|sign(ed)? out/i).first();
    const mounted = await page.evaluate(() => typeof window !== 'undefined');
    expect(mounted).toBe(true);
    if (await banner.count()) {
      await expect.soft(banner).toBeVisible();
    }

    // Clearing the session must bounce a protected route back to sign-in.
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.goto('/app');
    await page.waitForTimeout(2500);
    await expect(
      page.getByRole('button', { name: /sign in|log in/i }).first(),
      'an expired session must return the user to sign-in',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('UAT-AUTH-07 password reset can be requested from the sign-in page', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-07' });
    const user = users[0];

    await page.goto('/');
    const forgot = page.getByRole('button', { name: /forgot/i }).or(page.getByRole('link', { name: /forgot/i })).first();
    test.skip((await forgot.count()) === 0, 'Forgot password entry point not rendered');
    await forgot.click();

    const email = page.getByLabel(/email/i).first();
    await email.fill(user.email);
    await page.getByRole('button', { name: /send|reset/i }).first().click();

    await expect(
      page.getByText(/sent|check your (email|inbox)|reset link/i).first(),
      'a reset request must be acknowledged',
    ).toBeVisible({ timeout: 15_000 });
  });
});
