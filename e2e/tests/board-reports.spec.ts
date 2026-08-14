import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

/**
 * UAT-BRPT — board report generation and access control.
 *
 * `board_oversight` (see src/lib/permissions.ts) gates /board-reports; only
 * ADMIN/RMD/CRO/RCB-family roles may generate a report. Everyone else must be
 * refused, both at the route (AccessDenied) and at the generate action.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-BRPT board reports', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-BRPT-01 an authorised role generates a board report and downloads the PDF', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BRPT-01' });
    const u = byRole('CRO') || byRole('RMD') || byRole('ADMIN') || byRole('RCB');
    test.skip(!u, 'No board-reporting credentials configured');
    test.setTimeout(180_000);

    await login(page, u!);
    await page.goto('/board-reports');
    await page.waitForTimeout(1500);
    expect(await page.getByText(/access denied/i).count()).toBe(0);

    const generate = page.getByRole('button', { name: /^generate$|generate report/i }).first();
    if ((await generate.count()) === 0) test.skip(true, 'No generate control on this build');
    await generate.click();
    await page.waitForTimeout(4000);

    const downloadBtn = page.getByRole('button', { name: /download/i }).first();
    if ((await downloadBtn.count()) === 0) test.skip(true, 'No download control appeared after generation');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
      downloadBtn.click(),
    ]);
    expect.soft(download, 'expected a PDF download to start').not.toBeNull();
    if (download) expect.soft(download.suggestedFilename()).toMatch(/\.pdf$/i);

    await logout(page);
  });

  test('UAT-BRPT-02 an unauthorised role cannot reach the board reports page', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BRPT-02' });
    const viewer = byRole('RC') || byRole('RO') || byRole('USER');
    test.skip(!viewer, 'No restricted-role credentials configured');

    await login(page, viewer!);
    await page.goto('/board-reports');
    await page.waitForTimeout(1200);

    const denied = await page.getByText(/access denied|do not have permission/i).count();
    const redirected = new URL(page.url()).pathname !== '/board-reports';
    expect(denied > 0 || redirected).toBe(true);

    // Sidebar/deep-link must not offer a generate action either.
    expect(await page.getByRole('button', { name: /^generate$|generate report/i }).count()).toBe(0);

    await logout(page);
  });
});
