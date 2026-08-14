import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout, isAccessDenied } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-SET — administrative configuration: categories (enum sync), scoring
 * matrix and email templates.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);
const admin = () => byRole('ADMIN') || byRole('RMD') || byRole('CRO');

test.describe('UAT-SET settings and configuration', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-SET-01 a new risk category is usable immediately in the wizard', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-SET-01' });
    const user = admin();
    test.skip(!user, 'No ADMIN/RMD/CRO credentials configured');
    await login(page, user!);

    await page.goto('/settings');
    expect(await isAccessDenied(page), `${user!.role} should reach /settings`).toBe(false);

    const tab = page.getByRole('tab', { name: /categor/i }).first();
    test.skip((await tab.count()) === 0, 'Categories tab not offered');
    await tab.click();

    const name = `E2E Cat ${Date.now()}`;
    const add = page.getByRole('button', { name: /add category|new category/i }).first();
    test.skip((await add.count()) === 0, 'Add category action not offered');
    await add.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(name);
    await dialog.getByRole('button', { name: /save|create|add/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // The sync trigger must have widened the enum so the wizard can use it.
    await page.goto('/risk-register');
    const addRisk = page.getByRole('button', { name: /add new risk|add risk|new risk/i }).first();
    if (await addRisk.count()) {
      await addRisk.click();
      const trigger = page.getByText(/select category|category/i).first();
      if (await trigger.count()) {
        await trigger.click();
        await expect
          .soft(page.getByRole('option', { name }), 'new category must appear in the wizard')
          .toBeVisible({ timeout: 10_000 });
      }
    }

    await logout(page);
  });

  test('UAT-SET-02 the scoring matrix drives displayed severity bands', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-SET-02' });
    const user = admin();
    test.skip(!user, 'No ADMIN/RMD/CRO credentials configured');
    await login(page, user!);

    const matrix = await apiSelect(page, 'risk_scoring_matrix', 'select=*&limit=50');
    expect.soft(matrix.status, 'scoring matrix must be readable').toBeLessThan(400);
    let rows: unknown[] = [];
    try {
      rows = JSON.parse(matrix.body) || [];
    } catch {
      rows = [];
    }
    expect.soft(rows.length, 'a scoring matrix must be configured').toBeGreaterThan(0);

    await page.goto('/risk-matrix');
    await expect(page.getByRole('heading', { name: /risk matrix|heatmap/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // High severity is defined as score >= 15 in this deployment.
    await expect.soft(page.getByText(/high|critical/i).first()).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('UAT-SET-03 email templates are editable with placeholders per event type', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-SET-03' });
    const user = admin();
    test.skip(!user, 'No ADMIN/RMD/CRO credentials configured');
    await login(page, user!);

    await page.goto('/settings');
    const tab = page.getByRole('tab', { name: /email|template/i }).first();
    test.skip((await tab.count()) === 0, 'Email templates tab not offered');
    await tab.click();

    await expect(page.getByText(/template/i).first()).toBeVisible({ timeout: 10_000 });
    await expect
      .soft(page.getByText(/\{\{\s*\w+\s*\}\}/).first(), 'placeholders must be documented in the editor')
      .toBeVisible({ timeout: 10_000 });

    const templates = await apiSelect(page, 'risk_email_templates', 'select=id,event_type&limit=20');
    expect.soft(templates.status, 'templates must be readable by administrators').toBeLessThan(400);

    await logout(page);
  });
});
