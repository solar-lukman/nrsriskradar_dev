import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-REG (continued) — submit, RMD authoring regression, lookup-table driven
 * dropdowns, bulk upload, attachments and batch AI analysis.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

async function openWizard(page: import('@playwright/test').Page) {
  await page.goto('/risk-register');
  const addBtn = page.getByRole('button', { name: /add new risk|add risk|new risk/i }).first();
  await addBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await addBtn.click();
  await expect(page.getByText(/step 1 of 4/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('UAT-REG register data sources and bulk actions', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-REG-02 a draft risk can be submitted for review', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-02' });
    const user = byRole('RC') || byRole('RO') || byRole('RMD');
    test.skip(!user, 'No writer credentials configured');
    await login(page, user!);

    const draft = await apiSelect(page, 'risks', 'select=id&approval_status=eq.Draft&limit=1');
    let id: string | null = null;
    try {
      id = JSON.parse(draft.body)?.[0]?.id ?? null;
    } catch {
      id = null;
    }
    test.skip(!id, 'No Draft risk available to submit');

    await page.goto(`/risk-register?view=${id}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const submit = dialog.getByRole('button', { name: /submit for review/i }).first();
    test.skip((await submit.count()) === 0, 'Submit action not offered');
    await submit.click();
    const confirm = page.getByRole('button', { name: /^submit$|^confirm$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1500);

    const after = await apiSelect(page, 'risks', `select=approval_status&id=eq.${id}`);
    expect.soft(after.body, 'submitted risk should read Submitted').toMatch(/Submitted/i);

    await logout(page);
  });

  test('UAT-REG-03 RMD can author a risk (regression: prior submit error)', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-03' });
    const user = byRole('RMD');
    test.skip(!user, 'No RMD credentials configured');
    await login(page, user!);

    await openWizard(page);
    const title = `RMD authored E2E ${Date.now()}`;
    await page.getByRole('textbox').first().fill(title);
    await expect
      .soft(page.getByRole('button', { name: /^next$/i }), 'RMD must be able to proceed')
      .toBeEnabled({ timeout: 10_000 });

    await logout(page);
  });

  test('UAT-REG-04 category dropdown is fed by the risk_categories table', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-04' });
    const user = byRole('RMD') || byRole('RC') || byRole('ADMIN');
    test.skip(!user, 'No writer credentials configured');
    await login(page, user!);

    const cats = await apiSelect(page, 'risk_categories', 'select=name&is_active=eq.true&limit=5');
    let names: string[] = [];
    try {
      names = (JSON.parse(cats.body) || []).map((r: { name: string }) => r.name);
    } catch {
      names = [];
    }
    test.skip(names.length === 0, 'No active risk categories seeded');

    await openWizard(page);
    const trigger = page.getByText(/select category|category/i).first();
    await trigger.click();
    const options = page.getByRole('option');
    await options.first().waitFor({ state: 'visible', timeout: 8000 });
    const rendered = (await options.allTextContents()).map((s) => s.trim());
    expect
      .soft(rendered.some((r) => names.includes(r)), 'dropdown must reflect live table rows')
      .toBe(true);

    await logout(page);
  });

  test('UAT-REG-05 department dropdown is fed by the departments table', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-05' });
    const user = byRole('RMD') || byRole('RC') || byRole('ADMIN');
    test.skip(!user, 'No writer credentials configured');
    await login(page, user!);

    const deps = await apiSelect(page, 'departments', 'select=name&limit=5');
    let names: string[] = [];
    try {
      names = (JSON.parse(deps.body) || []).map((r: { name: string }) => r.name);
    } catch {
      names = [];
    }
    test.skip(names.length === 0, 'No departments seeded');

    await openWizard(page);
    const trigger = page.getByText(/select department|department/i).first();
    test.skip((await trigger.count()) === 0, 'Department control not on step 1');
    await trigger.click();
    const options = page.getByRole('option');
    await options.first().waitFor({ state: 'visible', timeout: 8000 });
    const rendered = (await options.allTextContents()).map((s) => s.trim());
    expect
      .soft(rendered.some((r) => names.includes(r)), 'dropdown must reflect live table rows')
      .toBe(true);

    await logout(page);
  });

  test('UAT-REG-06 CSV bulk upload validates rows before import', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-06' });
    const user = byRole('RMD') || byRole('ADMIN') || byRole('RC');
    test.skip(!user, 'No writer credentials configured');
    await login(page, user!);

    await page.goto('/risk-register');
    const bulk = page.getByRole('button', { name: /bulk upload|import/i }).first();
    test.skip((await bulk.count()) === 0, 'Bulk upload action not offered to this role');
    await bulk.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const csv = 'title,category,department\n,,\nValid E2E Risk,Operational,ICT\n';
    const input = dialog.locator('input[type="file"]').first();
    test.skip((await input.count()) === 0, 'No file input rendered');
    await input.setInputFiles({ name: 'bulk-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForTimeout(2000);

    await expect
      .soft(dialog.getByText(/invalid|error|row \d/i).first(), 'invalid rows must be itemised')
      .toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  test('UAT-REG-07 an attachment uploads into the risk document vault', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-07' });
    const user = byRole('RC') || byRole('RO') || byRole('RMD');
    test.skip(!user, 'No writer credentials configured');
    await login(page, user!);

    const res = await apiSelect(page, 'risks', 'select=id&limit=1');
    let id: string | null = null;
    try {
      id = JSON.parse(res.body)?.[0]?.id ?? null;
    } catch {
      id = null;
    }
    test.skip(!id, 'No risk visible to this role');

    await page.goto(`/risk-register?view=${id}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const input = dialog.locator('input[type="file"]').first();
    test.skip((await input.count()) === 0, 'Attachment upload not offered');
    const name = `e2e-evidence-${Date.now()}.txt`;
    await input.setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('e2e evidence') });
    await expect(dialog.getByText(name)).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('UAT-REG-08 batch AI analysis completes without a rate-limit crash', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-08' });
    test.setTimeout(120_000);
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/risk-register');
    const batch = page.getByRole('button', { name: /batch ai|ai analysis/i }).first();
    test.skip((await batch.count()) === 0, 'Batch AI action not offered');
    await batch.click();
    const run = page.getByRole('button', { name: /run|analyse|analyze|start/i }).last();
    if (await run.count()) await run.click();

    await expect(
      page.getByText(/complete|analysed|analyzed|score/i).first(),
    ).toBeVisible({ timeout: 90_000 });
    await expect
      .soft(page.getByText(/rate limit|429|too many requests/i))
      .toHaveCount(0);

    await logout(page);
  });
});
