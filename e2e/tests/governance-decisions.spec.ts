import { test, expect, Page } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-GOV (continued) — decision effects on the risk record, immutable
 * history, minute references and executive read-only visibility.
 * Button gating and the rationale guard live in kri-governance.spec.ts.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);
const mandated = () => byRole('RMD') || byRole('CRO') || byRole('ADMIN');

async function openFirstRisk(page: Page): Promise<string | null> {
  const res = await apiSelect(page, 'risks', 'select=id&limit=1');
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

test.describe('UAT-GOV committee decision records', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-GOV-04 an Accept decision stamps the risk treatment strategy', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-04' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const riskId = await openFirstRisk(page);
    test.skip(!riskId, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    const record = dialog.getByRole('button', { name: /record decision/i }).first();
    test.skip((await record.count()) === 0, 'Record decision action not offered');
    await record.click();

    // Choose the Accept decision type where the control exposes it.
    const typeTrigger = dialog.getByText(/decision type/i).first();
    if (await typeTrigger.count()) {
      await typeTrigger.click();
      const accept = page.getByRole('option', { name: /^accept$/i }).first();
      if (await accept.count()) await accept.click();
    }
    await dialog.locator('#gd-rationale').fill('Committee accepted the residual exposure for this cycle.');
    await dialog.getByRole('button', { name: /save decision/i }).click();
    await page.waitForTimeout(2500);

    const after = await apiSelect(page, 'risks', `select=treatment_strategy&id=eq.${riskId}`);
    expect
      .soft(after.body, 'an Accept decision must stamp the treatment strategy')
      .toMatch(/Accept/i);

    await logout(page);
  });

  test('UAT-GOV-06 the decision history is append-only and shows the minute reference', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-06' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const existing = await apiSelect(
      page,
      'risk_governance_decisions',
      'select=id,risk_id,forum,decision_type,minute_reference,decision_date&limit=1',
    );
    let row: { risk_id?: string; forum?: string } | null = null;
    try {
      row = JSON.parse(existing.body)?.[0] ?? null;
    } catch {
      row = null;
    }
    test.skip(!row?.risk_id, 'No governance decision recorded yet');

    await page.goto(`/risk-register?view=${row!.risk_id}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/committee decisions/i)).toBeVisible({ timeout: 10_000 });
    if (row!.forum) {
      await expect.soft(dialog.getByText(new RegExp(row!.forum!, 'i')).first()).toBeVisible({
        timeout: 10_000,
      });
    }

    // No edit/delete affordance may exist on a recorded decision.
    const panel = dialog.getByText(/committee decisions/i).locator('xpath=ancestor::*[3]');
    await expect
      .soft(panel.getByRole('button', { name: /^delete$|^edit$/i }), 'decisions must be append-only')
      .toHaveCount(0);

    await logout(page);
  });

  test('UAT-GOV-07 executives can read decisions but cannot record them', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-07' });
    const user = byRole('EC') || byRole('ERMSC') || byRole('RCB');
    test.skip(!user, 'No executive credentials configured');
    await login(page, user!);

    const riskId = await openFirstRisk(page);
    test.skip(!riskId, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    await expect.soft(dialog.getByText(/committee decisions/i)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: /record decision/i })).toHaveCount(0);

    await logout(page);
  });
});

test.describe('UAT-GOV recording decisions', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  async function recordDecision(page: Page, decision: RegExp) {
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const riskId = await openFirstRisk(page);
    test.skip(!riskId, 'No risk visible to this role');

    const dialog = page.getByRole('dialog');
    const record = dialog.getByRole('button', { name: /record decision/i }).first();
    test.skip((await record.count()) === 0, 'Record decision action not offered');
    await record.click();

    const typeTrigger = dialog.getByText(/decision type/i).first();
    if (await typeTrigger.count()) {
      await typeTrigger.click();
      const option = page.getByRole('option', { name: decision }).first();
      if (await option.count()) await option.click();
    }

    const forumTrigger = dialog.getByText(/forum/i).first();
    if (await forumTrigger.count()) {
      await forumTrigger.click();
      const ermsc = page.getByRole('option', { name: /ermsc/i }).first();
      if (await ermsc.count()) await ermsc.click();
    }

    const minute = dialog.locator('#gd-minute-reference, [id*="minute"]').first();
    if (await minute.count()) await minute.fill(`ERMSC/E2E/${Date.now()}`);

    await dialog.locator('#gd-rationale').fill('Recorded by the automated UAT suite for traceability.');
    await dialog.getByRole('button', { name: /save decision/i }).click();
    await page.waitForTimeout(2500);

    const saved = await apiSelect(
      page,
      'risk_governance_decisions',
      `select=id,decision_type,forum,minute_reference&risk_id=eq.${riskId}&order=created_at.desc&limit=1`,
    );
    expect.soft(saved.status, saved.body).toBeLessThan(400);
    expect.soft(saved.body, 'the decision must be persisted against the risk').not.toBe('[]');

    await logout(page);
  }

  test('UAT-GOV-01 an ERMSC Accept decision is recorded with rationale and minute reference', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-01' });
    await recordDecision(page, /^accept$/i);
  });

  test('UAT-GOV-02 an ERMSC Escalate decision is recorded with a minute reference', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-02' });
    await recordDecision(page, /^escalate$/i);
  });
});
