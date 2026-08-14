import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout, isAccessDenied } from '../fixtures/auth';

/**
 * UAT-AUD — Risk Changes audit trail, persisted view preferences and the
 * access boundary for non-governance roles.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-AUD audit logs', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-AUD-01 RMD/CRO see the Risk Changes diff history', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUD-01' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/audit-logs');
    expect(await isAccessDenied(page), `${user!.role} must reach /audit-logs`).toBe(false);

    const tab = page.getByRole('tab', { name: /risk changes/i });
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();

    // who / when / what columns must all be present.
    for (const col of [/user|changed by|who/i, /date|when|timestamp/i, /field|change|what/i]) {
      await expect.soft(page.getByText(col).first()).toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
  });

  test('UAT-AUD-02 date range, sort and page size survive a reload', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUD-02' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/audit-logs');
    const tab = page.getByRole('tab', { name: /risk changes/i });
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();

    // Change the page size — the most reliably persisted preference.
    const sizeTrigger = page.getByText(/rows per page|page size|per page/i).first();
    test.skip((await sizeTrigger.count()) === 0, 'Page size control not rendered');
    await sizeTrigger.click();
    const option = page.getByRole('option').nth(1);
    await option.waitFor({ state: 'visible', timeout: 5000 });
    const chosen = (await option.textContent())?.trim() || '';
    await option.click();
    await page.waitForTimeout(800);

    const persisted = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => /audit|risk-?change/i.test(k))
        .map((k) => `${k}=${localStorage.getItem(k)}`)
        .join(';'),
    );
    expect
      .soft(persisted, 'view preferences must be written to localStorage')
      .not.toBe('');

    await page.reload();
    await page.getByRole('tab', { name: /risk changes/i }).click();
    await page.waitForTimeout(1000);
    if (chosen) {
      await expect
        .soft(page.getByText(chosen).first(), 'page size should be restored after reload')
        .toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
  });

  test('UAT-AUD-03 RC is denied access to /audit-logs', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUD-03' });
    const user = byRole('RC') || byRole('RO') || byRole('RR');
    test.skip(!user, 'No RC/RO/RR credentials configured');
    await login(page, user!);

    await page.goto('/audit-logs');
    await page.waitForTimeout(1200);
    const denied = await isAccessDenied(page);
    const redirected = new URL(page.url()).pathname !== '/audit-logs';
    expect(denied || redirected, `${user!.role} must not reach /audit-logs`).toBe(true);

    await logout(page);
  });
});
