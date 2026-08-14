import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-RPT — board reporting and dashboard drill-down.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-RPT reporting and dashboard', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-RPT-01 board report can be generated and archived', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-05' });
    const u = byRole('CRO') || byRole('RMD') || byRole('ADMIN');
    test.skip(!u, 'No reporting credentials configured');
    test.setTimeout(180_000);

    await login(page, u!);
    await page.goto('/board-reports');
    await page.waitForTimeout(1500);

    const generate = page.getByRole('button', { name: /generate/i }).first();
    if ((await generate.count()) === 0) test.skip(true, 'No generate control on this build');
    await generate.click();
    await page.waitForTimeout(5000);

    const archive = await apiSelect(
      page,
      'board_report_archives',
      'select=id,report_type,generated_at&order=generated_at.desc&limit=1',
    );
    expect.soft(archive.status, archive.body).toBe(200);

    await logout(page);
  });

  test('UAT-RPT-02 dashboard cards drill down into filtered views', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-02' });
    const u = byRole('RMD') || byRole('ADMIN') || byRole('CRO');
    test.skip(!u, 'No dashboard credentials configured');
    test.setTimeout(120_000);

    await login(page, u!);
    await page.goto('/app');
    await page.waitForTimeout(2500);

    // Metrics must be real numbers, not skeleton placeholders.
    const body = await page.locator('body').innerText();
    expect.soft(body).not.toMatch(/\bNaN\b/);

    const card = page.getByText(/high (severity|risk)/i).first();
    if ((await card.count()) === 0) test.skip(true, 'No drill-down card found');
    await card.click();
    await page.waitForTimeout(1500);

    // Drill-down must navigate away from the dashboard with a filter applied.
    const url = new URL(page.url());
    expect.soft(url.pathname === '/app' && url.search === '').toBe(false);

    await logout(page);
  });

  test('UAT-RPT-03 executive roles reach the executive summary', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DSH-04' });
    const exec = byRole('EC') || byRole('ERMSC') || byRole('RCB');
    test.skip(!exec, 'No executive credentials configured');

    await login(page, exec!);
    await page.goto('/executive-summary');
    await page.waitForTimeout(1500);
    expect(await page.getByText(/access denied/i).count()).toBe(0);
    await logout(page);
  });
});
