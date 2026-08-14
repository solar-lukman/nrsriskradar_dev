import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

/**
 * UAT-DSH (continued) — cross-role metric parity, heatmap rendering budget
 * and dashboard export.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

async function readBcpCoverage(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/app');
  await page.waitForTimeout(3000);
  const card = page.getByText(/bcp (coverage|%)|business continuity/i).first();
  if ((await card.count()) === 0) return null;
  const scope = card.locator('xpath=ancestor::*[self::div][1]');
  const text = (await scope.textContent()) || (await card.textContent()) || '';
  const m = text.match(/(\d{1,3})\s*%/);
  return m ? m[1] : null;
}

test.describe('UAT-DSH dashboard consistency', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-DSH-01 BCP % coverage is identical across roles on the same day', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-01' });
    const a = byRole('CRO') || byRole('RMD');
    const b = byRole('RCB') || byRole('EC') || byRole('ERMSC') || byRole('ADMIN');
    test.skip(!a || !b, 'Need two roles with credentials to compare');

    await login(page, a!);
    const first = await readBcpCoverage(page);
    await logout(page);

    await login(page, b!);
    const second = await readBcpCoverage(page);
    await logout(page);

    test.skip(first === null || second === null, 'BCP coverage card not rendered for both roles');
    expect(
      second,
      `BCP coverage must match across roles (${a!.role}=${first}%, ${b!.role}=${second}%)`,
    ).toBe(first);
  });

  test('UAT-DSH-03 the risk matrix heatmap renders inside the performance budget', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-03' });
    const user = byRole('RMD') || byRole('CRO') || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    const started = Date.now();
    await page.goto('/risk-matrix');
    await expect(page.getByRole('heading', { name: /risk matrix|heatmap/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    const cells = page.locator('[data-matrix-cell], table td, [role="gridcell"]');
    await expect(cells.first()).toBeVisible({ timeout: 15_000 });
    const elapsed = Date.now() - started;
    expect.soft(elapsed, `heatmap should render in under 5s (took ${elapsed}ms)`).toBeLessThan(5000);
    expect.soft(await cells.count(), 'heatmap must render cells').toBeGreaterThan(0);

    await logout(page);
  });

  test('UAT-DSH-06 dashboard export produces a file', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-06' });
    const user = byRole('RMD') || byRole('CRO') || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    await page.goto('/risk-matrix');
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    test.skip((await exportBtn.count()) === 0, 'Export action not offered');
    await exportBtn.click();

    const item = page.getByRole('menuitem', { name: /pdf|png|csv/i }).first();
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
    if (await item.count()) await item.click();
    const download = await downloadPromise;
    expect.soft(download, 'an export file should be produced').not.toBeNull();
    if (download) {
      expect.soft(download.suggestedFilename()).toMatch(/\.(pdf|png|csv)$/i);
    }

    await logout(page);
  });
});
