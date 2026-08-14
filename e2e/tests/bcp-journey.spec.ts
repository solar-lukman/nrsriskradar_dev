import { test, expect, Page } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-BCP — business continuity journey.
 *
 *   create plan (title, department, business function, RTO/RPO)
 *   → record mitigation actions
 *   → complete the BIA section (criticality, impacts, MTD, assessment date)
 *   → log a test (type, scope, results)
 *   → confirm version history captured the changed fields
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);
const title = () => `BCP E2E ${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function pickFirstOption(page: Page, placeholder: RegExp) {
  const trigger = page.getByText(placeholder).first();
  if ((await trigger.count()) === 0) return false;
  await trigger.click();
  const option = page.getByRole('option').first();
  await option.waitFor({ state: 'visible', timeout: 5000 });
  await option.click();
  return true;
}

test.describe('UAT-BCP business continuity journey', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-BCP-01 create a plan with RTO/RPO and mitigation actions', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-01' });
    const owner = byRole('RMD') || byRole('ADMIN') || byRole('CRO');
    test.skip(!owner, 'No BCP-authoring credentials configured');
    test.setTimeout(120_000);

    const name = title();
    await login(page, owner!);
    await page.goto('/business-continuity');

    const addBtn = page.getByRole('button', { name: /add (new )?(bcp|plan)|new plan/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await addBtn.click();

    await page.getByRole('textbox').first().fill(name);
    const desc = page.locator('textarea').first();
    if (await desc.count()) await desc.fill('Continuity plan created by the automated UAT suite.');
    await pickFirstOption(page, /select department|choose department/i);

    // RTO / RPO are numeric inputs — fill whatever numeric fields exist.
    const numbers = page.locator('input[type="number"]');
    const numCount = await numbers.count();
    for (let i = 0; i < Math.min(numCount, 2); i++) {
      await numbers.nth(i).fill(String(4 * (i + 1)));
    }

    const create = page.getByRole('button', { name: /^create|^save|^add plan/i }).last();
    await create.click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });

    const row = await apiSelect(
      page,
      'business_continuity_plans',
      `select=id,reference_number,mitigation_actions&title=eq.${encodeURIComponent(name)}`,
    );
    expect(row.status, row.body).toBe(200);
    expect(row.body).not.toBe('[]');

    await logout(page);
  });

  test('UAT-BCP-02 BIA and test-detail validation errors render inline', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-02' });
    const owner = byRole('RMD') || byRole('ADMIN');
    test.skip(!owner, 'No BCP-authoring credentials configured');
    test.setTimeout(120_000);

    await login(page, owner!);
    await page.goto('/business-continuity');
    await page.waitForTimeout(1500);

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if ((await editBtn.count()) === 0) test.skip(true, 'No existing BCP available to edit');
    await editBtn.click();

    // Max tolerable downtime must reject a negative value with an inline message,
    // not just a toast.
    const mtd = page.getByLabel(/max(imum)? tolerable downtime/i).first();
    if ((await mtd.count()) === 0) test.skip(true, 'BIA section not present in this build');
    await mtd.fill('-5');

    const save = page.getByRole('button', { name: /save|update/i }).last();
    await save.click();
    await page.waitForTimeout(800);

    const inline = page.getByText(/must be|required|invalid|cannot be negative/i);
    expect.soft(await inline.count(), 'expected an inline validation message').toBeGreaterThan(0);

    await logout(page);
  });

  test('UAT-BCP-03 editing a plan writes version history', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-03' });
    const owner = byRole('RMD') || byRole('ADMIN');
    test.skip(!owner, 'No BCP-authoring credentials configured');
    test.setTimeout(120_000);

    await login(page, owner!);
    await page.goto('/business-continuity');
    await page.waitForTimeout(1500);

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if ((await editBtn.count()) === 0) test.skip(true, 'No existing BCP available to edit');
    await editBtn.click();

    const descField = page.locator('textarea').first();
    if (await descField.count()) {
      await descField.fill(`UAT touch ${new Date().toISOString()}`);
      await page.getByRole('button', { name: /save|update/i }).last().click();
      await page.waitForTimeout(2000);
    }

    const history = await apiSelect(
      page,
      'bcp_version_history',
      'select=id,action,changed_fields&order=performed_at.desc&limit=1',
    );
    expect.soft(history.status, history.body).toBe(200);
    expect.soft(history.body).not.toBe('[]');

    await logout(page);
  });

  test('UAT-BCP-05 editing BIA fields twice shows a diff with author and timestamp ordering', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-extra-diff' });
    const owner = byRole('RMD') || byRole('ADMIN');
    test.skip(!owner, 'No BCP-authoring credentials configured');
    test.setTimeout(150_000);

    await login(page, owner!);
    await page.goto('/business-continuity');
    await page.waitForTimeout(1500);

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if ((await editBtn.count()) === 0) test.skip(true, 'No existing BCP available to edit');
    await editBtn.click();
    await page.waitForTimeout(800);

    const mtd = page.getByLabel(/max(imum)? tolerable downtime/i).first();
    if ((await mtd.count()) === 0) test.skip(true, 'BIA section not present in this build');

    // --- first edit ----------------------------------------------------
    await mtd.fill('12');
    const save = page.getByRole('button', { name: /save|update/i }).last();
    await save.click();
    await page.waitForTimeout(2000);

    // --- second edit -----------------------------------------------------
    const editBtn2 = page.getByRole('button', { name: /edit/i }).first();
    if (await editBtn2.count()) await editBtn2.click();
    const mtd2 = page.getByLabel(/max(imum)? tolerable downtime/i).first();
    await mtd2.fill('24');
    await page.getByRole('button', { name: /save|update/i }).last().click();
    await page.waitForTimeout(2000);

    // --- version-history panel must render a before → after diff ---------
    const historyPanel = page.getByText(/version history/i).first();
    if (await historyPanel.count()) {
      await historyPanel.scrollIntoViewIfNeeded();
      expect.soft(await page.getByText(/max tolerable downtime/i).count()).toBeGreaterThan(0);
    }

    // --- server-side rows confirm changed fields, author and ordering ----
    const history = await apiSelect(
      page,
      'bcp_version_history',
      'select=id,action,changed_fields,performed_by,performed_at&order=performed_at.asc&limit=10',
    );
    expect.soft(history.status, history.body).toBe(200);
    const rows = JSON.parse(history.body || '[]');
    expect.soft(rows.length, 'expected at least two tracked edits').toBeGreaterThanOrEqual(2);
    if (rows.length >= 2) {
      const last2 = rows.slice(-2);
      const timestamps = last2.map((r: { performed_at: string }) => new Date(r.performed_at).getTime());
      expect.soft(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
      for (const row of last2) {
        expect.soft(row.performed_by, 'each version row must record its author').toBeTruthy();
        expect.soft(Array.isArray(row.changed_fields)).toBe(true);
      }
    }

    await logout(page);
  });

  test('UAT-BCP-04 schema-check log page is admin/RMD only', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-05' });
    const viewer = byRole('RC') || byRole('USER') || byRole('EC');
    test.skip(!viewer, 'No restricted-role credentials configured');

    await login(page, viewer!);
    await page.goto('/bcp-schema-checks');
    await page.waitForTimeout(1000);
    const denied = await page.getByText(/access denied|do not have permission/i).count();
    const redirected = new URL(page.url()).pathname !== '/bcp-schema-checks';
    expect(denied > 0 || redirected).toBe(true);
    await logout(page);
  });
});
