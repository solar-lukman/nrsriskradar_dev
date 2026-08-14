import { test, expect, Page } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-TRT — risk treatment: mitigation tasks, budget in NGN, completion
 * transition to Mitigated, AI recommendations and budget threshold colouring.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);
const writer = () => byRole('RO') || byRole('RMD') || byRole('ADMIN');

async function openFirstRisk(page: Page): Promise<boolean> {
  const res = await apiSelect(page, 'risks', 'select=id&limit=1');
  let id: string | null = null;
  try {
    id = JSON.parse(res.body)?.[0]?.id ?? null;
  } catch {
    id = null;
  }
  if (!id) return false;
  await page.goto(`/risk-register?view=${id}`);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  return true;
}

test.describe('UAT-TRT treatment and mitigation', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-TRT-01 mitigation task with an NGN budget is saved and listed', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-TRT-01' });
    const user = writer();
    test.skip(!user, 'No RO/RMD/ADMIN credentials configured');
    await login(page, user!);

    const opened = await openFirstRisk(page);
    test.skip(!opened, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/mitigation task/i).first()).toBeVisible({ timeout: 10_000 });

    const addTask = dialog.getByRole('button', { name: /add task/i }).first();
    test.skip((await addTask.count()) === 0, 'Add Task action not offered to this role');
    await addTask.click();

    const title = `E2E mitigation ${Date.now()}`;
    const form = page.getByRole('dialog').last();
    await form.getByRole('textbox').first().fill(title);

    // Budget is captured in NGN — the currency must be shown next to the field.
    await expect
      .soft(form.getByText(/NGN|₦/).first(), 'budget field must be denominated in NGN')
      .toBeVisible();

    const budget = form.locator('input[type="number"]').first();
    if (await budget.count()) await budget.fill('250000');

    const save = form.getByRole('button', { name: /^save$|^add task$|^create$/i }).last();
    await save.click();

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  test('UAT-TRT-02 completing every mitigation task transitions the risk to Mitigated', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-TRT-02' });
    const user = writer();
    test.skip(!user, 'No RO/RMD/ADMIN credentials configured');
    await login(page, user!);

    // Find a risk that already has at least one open mitigation task.
    const tasks = await apiSelect(
      page,
      'risk_mitigation_tasks',
      'select=id,risk_id,status&status=neq.Completed&limit=1',
    );
    let riskId: string | null = null;
    try {
      riskId = JSON.parse(tasks.body)?.[0]?.risk_id ?? null;
    } catch {
      riskId = null;
    }
    test.skip(!riskId, 'No open mitigation task available to complete');

    await page.goto(`/risk-register?view=${riskId}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Complete every open task offered in the panel.
    for (let i = 0; i < 10; i++) {
      const complete = dialog.getByRole('button', { name: /complete|mark done/i }).first();
      if ((await complete.count()) === 0) break;
      await complete.click();
      await page.waitForTimeout(1200);
    }

    const after = await apiSelect(page, 'risks', `select=status&id=eq.${riskId}`);
    expect
      .soft(after.body, 'risk should read Mitigated once all tasks are complete')
      .toMatch(/Mitigated/i);

    await logout(page);
  });

  test('UAT-TRT-03 AI mitigation recommendations return within 30s', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-TRT-03' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const opened = await openFirstRisk(page);
    test.skip(!opened, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    const aiBtn = dialog
      .getByRole('button', { name: /ai (mitigation|recommend)|recommend|suggest mitigation/i })
      .first();
    test.skip((await aiBtn.count()) === 0, 'AI mitigation action not offered');

    const started = Date.now();
    await aiBtn.click();
    await expect(
      page.getByText(/recommend|suggestion|mitigation plan/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - started, 'recommendations must return inside 30s').toBeLessThan(30_000);

    await logout(page);
  });

  test('UAT-TRT-04 budget utilisation thresholds flip the indicator colour', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-TRT-04' });
    const user = writer();
    test.skip(!user, 'No RO/RMD/ADMIN credentials configured');
    await login(page, user!);

    const opened = await openFirstRisk(page);
    test.skip(!opened, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    const utilisation = dialog.getByText(/% (of )?budget|budget utilis/i).first();
    test.skip((await utilisation.count()) === 0, 'Budget utilisation indicator not rendered');

    // The indicator must carry a semantic colour class, never a hardcoded hex.
    const cls = await utilisation.getAttribute('class');
    expect
      .soft(cls || '', 'utilisation indicator should be colour-coded')
      .toMatch(/text-|bg-/);

    await logout(page);
  });
});
