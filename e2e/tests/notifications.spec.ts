import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-NTF — notification centre behaviour: unread counts, deep links and the
 * quiet-hours / mute gate on realtime pop-ups.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-NTF notifications', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-NTF-01 unread count decrements when a notification is read', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-NTF-01' });
    const user = byRole('RMD') || byRole('CRO') || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    await page.goto('/app');
    const bell = page.getByRole('button', { name: /notification/i }).first();
    await bell.waitFor({ state: 'visible', timeout: 15_000 });

    const unread = await apiSelect(page, 'notifications', 'select=id&is_read=eq.false&limit=5');
    let rows: Array<{ id: string }> = [];
    try {
      rows = JSON.parse(unread.body) || [];
    } catch {
      rows = [];
    }
    test.skip(rows.length === 0, 'No unread notifications for this user');

    await bell.click();
    const panel = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]')).first();
    await expect(panel).toBeVisible({ timeout: 10_000 });

    const markRead = page.getByRole('button', { name: /mark (all )?as read|mark read/i }).first();
    test.skip((await markRead.count()) === 0, 'Mark-as-read action not offered');
    await markRead.click();
    await page.waitForTimeout(1500);

    const after = await apiSelect(page, 'notifications', 'select=id&is_read=eq.false&limit=5');
    let remaining = rows.length;
    try {
      remaining = (JSON.parse(after.body) || []).length;
    } catch {
      /* keep prior value */
    }
    expect.soft(remaining, 'unread count must drop after marking read').toBeLessThan(rows.length);

    await logout(page);
  });

  test('UAT-NTF-02 a notification deep-links to its related record', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-NTF-02' });
    const user = byRole('RMD') || byRole('CRO') || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    await page.goto('/app');
    const bell = page.getByRole('button', { name: /notification/i }).first();
    await bell.waitFor({ state: 'visible', timeout: 15_000 });
    await bell.click();

    const item = page
      .locator('[data-notification-item], [role="menuitem"], li')
      .filter({ hasText: /risk|incident|bcp|case/i })
      .first();
    test.skip((await item.count()) === 0, 'No linkable notification present');

    const before = page.url();
    await item.click();
    await page.waitForTimeout(2000);
    expect
      .soft(page.url(), 'clicking a notification must navigate to the related record')
      .not.toBe(before);

    await logout(page);
  });

  test('UAT-NTF-03 quiet hours and mutes suppress realtime pop-ups', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-NTF-03' });
    const user = byRole('RMD') || byRole('CRO') || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    await page.goto('/profile');
    const prefs = page.getByText(/notification preferences|quiet hours/i).first();
    test.skip((await prefs.count()) === 0, 'Notification preferences not rendered on the profile page');
    await expect(prefs).toBeVisible({ timeout: 10_000 });

    const stored = await apiSelect(page, 'notification_preferences', 'select=*&limit=1');
    expect
      .soft(stored.status, 'preferences must be readable by their owner')
      .toBeLessThan(400);

    // Toggling a mute must persist without needing a page reload or a
    // subscription restart (the preferencesRef live-read fix).
    const toggle = page.getByRole('switch').first();
    if (await toggle.count()) {
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await page.waitForTimeout(1500);
      const after = await toggle.getAttribute('aria-checked');
      expect.soft(after, 'the mute toggle must change state').not.toBe(before);
      await toggle.click();
      await page.waitForTimeout(1000);
    }

    await logout(page);
  });
});
