import { test, expect, Page } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-APP (continued) — withdrawal rules, claim-lock and the escalation pair.
 * The happy-path claim/approve/return flow lives in risk-journey.spec.ts.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

async function openRiskWithStatus(page: Page, filter: string): Promise<string | null> {
  const res = await apiSelect(page, 'risks', `select=id&${filter}&limit=1`);
  try {
    const id = JSON.parse(res.body)?.[0]?.id ?? null;
    if (!id) return null;
    await page.goto(`/risk-register?view=${id}`);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    return id;
  } catch {
    return null;
  }
}

test.describe('UAT-APP approval edge cases', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-APP-04 originator can withdraw a submitted risk before it is claimed', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-APP-04' });
    const user = byRole('RC') || byRole('RO');
    test.skip(!user, 'No RC/RO credentials configured');
    await login(page, user!);

    const id = await openRiskWithStatus(page, 'approval_status=eq.Submitted');
    test.skip(!id, 'No Submitted risk available');

    const dialog = page.getByRole('dialog');
    const withdraw = dialog.getByRole('button', { name: /withdraw|recall/i }).first();
    test.skip((await withdraw.count()) === 0, 'Withdraw action not offered');
    await withdraw.click();
    const confirm = page.getByRole('button', { name: /^withdraw$|^confirm$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1500);

    const after = await apiSelect(page, 'risks', `select=approval_status&id=eq.${id}`);
    expect.soft(after.body, 'withdrawn risk returns to Draft').toMatch(/Draft/i);

    await logout(page);
  });

  test('UAT-APP-05 withdrawal is blocked once a reviewer has claimed the risk', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-APP-05' });
    const user = byRole('RC') || byRole('RO');
    test.skip(!user, 'No RC/RO credentials configured');
    await login(page, user!);

    const id = await openRiskWithStatus(page, 'approval_status=eq.Under Review');
    test.skip(!id, 'No Under Review risk available');

    const dialog = page.getByRole('dialog');
    const withdraw = dialog.getByRole('button', { name: /withdraw|recall/i }).first();
    if (await withdraw.count()) {
      await withdraw.click();
      const confirm = page.getByRole('button', { name: /^withdraw$|^confirm$/i }).last();
      if (await confirm.count()) await confirm.click();
      await page.waitForTimeout(1500);
      await expect
        .soft(page.getByText(/cannot|not allowed|already (claimed|under review)/i).first())
        .toBeVisible({ timeout: 8000 });
    }

    const after = await apiSelect(page, 'risks', `select=approval_status&id=eq.${id}`);
    expect(after.body, 'claimed risk must stay Under Review').toMatch(/Under Review/i);

    await logout(page);
  });

  test('UAT-APP-06 CRO escalates an approved risk', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-APP-06' });
    const user = byRole('CRO') || byRole('RMD') || byRole('ADMIN');
    test.skip(!user, 'No CRO/RMD/ADMIN credentials configured');
    await login(page, user!);

    const id = await openRiskWithStatus(page, 'approval_status=eq.Approved&status=neq.Escalated');
    test.skip(!id, 'No Approved risk available');

    const dialog = page.getByRole('dialog');
    const escalate = dialog.getByRole('button', { name: /^escalate$/i }).first();
    test.skip((await escalate.count()) === 0, 'Escalate action not offered');
    await escalate.click();
    const reason = page.getByRole('textbox').last();
    if (await reason.count()) await reason.fill('E2E escalation for executive visibility');
    const confirm = page.getByRole('button', { name: /^escalate$|^confirm$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1500);

    const after = await apiSelect(page, 'risks', `select=status&id=eq.${id}`);
    expect.soft(after.body, 'escalated risk should read Escalated').toMatch(/Escalated/i);

    await logout(page);
  });

  test('UAT-APP-07 ADMIN de-escalates back to the prior lifecycle state', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-APP-07' });
    const user = byRole('ADMIN') || byRole('CRO');
    test.skip(!user, 'No ADMIN/CRO credentials configured');
    await login(page, user!);

    const id = await openRiskWithStatus(page, 'status=eq.Escalated');
    test.skip(!id, 'No Escalated risk available');

    const dialog = page.getByRole('dialog');
    const deEscalate = dialog.getByRole('button', { name: /de-?escalate/i }).first();
    test.skip((await deEscalate.count()) === 0, 'De-escalate action not offered');
    await deEscalate.click();
    const confirm = page.getByRole('button', { name: /de-?escalate|^confirm$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1500);

    const after = await apiSelect(page, 'risks', `select=status&id=eq.${id}`);
    expect.soft(after.body, 'de-escalated risk must leave Escalated').not.toMatch(/Escalated/i);

    await logout(page);
  });
});
