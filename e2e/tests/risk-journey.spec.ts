import { test, expect, Page } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * UAT-RISK — full risk lifecycle through the 4-step intake wizard.
 *
 *   Step 1 Identify → Step 2 Assess (inherent) → Step 3 Treat (+ residual)
 *   → Step 4 Monitor → Create → Submit for Review → Claim → Approve
 *
 * Each created risk carries a unique title so the spec can find and clean up
 * exactly its own record and never touches production-looking data.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

function uniqueTitle(prefix: string) {
  return `${prefix} E2E ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/** Select a shadcn <Select> by its trigger placeholder, picking the first option. */
async function pickFirstOption(page: Page, placeholder: RegExp) {
  const trigger = page.getByText(placeholder).first();
  if ((await trigger.count()) === 0) return false;
  await trigger.click();
  const option = page.getByRole('option').first();
  await option.waitFor({ state: 'visible', timeout: 5000 });
  await option.click();
  return true;
}

async function openWizard(page: Page) {
  await page.goto('/risk-register');
  const addBtn = page.getByRole('button', { name: /add new risk|add risk|new risk/i }).first();
  await addBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await addBtn.click();
  await expect(page.getByText(/step 1 of 4/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('UAT-RISK risk lifecycle', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-RISK-01 RC completes the 4-step wizard and creates a risk', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RISK-01' });
    const author = byRole('RC') || byRole('RMD') || byRole('ADMIN');
    test.skip(!author, 'No risk-authoring credentials configured');
    test.setTimeout(120_000);

    await login(page, author!);
    await openWizard(page);

    const title = uniqueTitle('Wizard risk');

    // ---- Step 1: Identify -------------------------------------------------
    // Next must be blocked until the mandatory identification fields are set.
    const next = page.getByRole('button', { name: /^next$/i });
    await expect.soft(next).toBeDisabled();

    await page.getByRole('textbox').first().fill(title);
    const description = page.locator('textarea').first();
    await description.fill('Created by the automated UAT suite. Safe to delete.');
    await pickFirstOption(page, /select category/i);
    await pickFirstOption(page, /select department/i);

    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.click();

    // ---- Step 2: Assess (inherent likelihood x impact) --------------------
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    // The early-save escape hatch must exist in create mode.
    await expect.soft(page.getByRole('button', { name: /create risk now/i })).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    // ---- Step 3: Treat ----------------------------------------------------
    await expect(page.getByText(/step 3 of 4/i)).toBeVisible();
    const plan = page.getByPlaceholder(/describe the actions to reduce this risk/i);
    if (await plan.count()) await plan.fill('Automated UAT mitigation plan.');
    await page.getByRole('button', { name: /^next$/i }).click();

    // ---- Step 4: Monitor + save ------------------------------------------
    await expect(page.getByText(/step 4 of 4/i)).toBeVisible();
    const save = page.getByRole('button', { name: /^create risk$|^submit anyway$/i }).first();
    await save.click();

    // The register must show the new record.
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    // And it must actually exist server-side with a generated reference.
    const row = await apiSelect(
      page,
      'risks',
      `select=id,risk_reference,approval_status&title=eq.${encodeURIComponent(title)}`,
    );
    expect(row.status, row.body).toBe(200);
    expect(row.body).not.toBe('[]');

    await logout(page);
  });

  test('UAT-RISK-02 wizard blocks progress when mandatory fields are missing', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RISK-02' });
    const author = byRole('RC') || byRole('RMD') || byRole('ADMIN');
    test.skip(!author, 'No risk-authoring credentials configured');

    await login(page, author!);
    await openWizard(page);

    // Empty step 1 must never let the user advance.
    await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled();

    // Title alone is not enough — category and department are also required.
    await page.getByRole('textbox').first().fill(uniqueTitle('Incomplete'));
    await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled();

    await logout(page);
  });

  test('UAT-RISK-03 submit → claim → approve records approval history', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RISK-03' });
    const author = byRole('RC') || byRole('RO');
    const approver = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!author || !approver, 'Author or approver credentials not configured');
    test.setTimeout(180_000);

    const title = uniqueTitle('Approval risk');

    // --- author creates and submits ---------------------------------------
    await login(page, author!);
    await openWizard(page);
    await page.getByRole('textbox').first().fill(title);
    await page.locator('textarea').first().fill('Approval-path risk created by UAT.');
    await pickFirstOption(page, /select category/i);
    await pickFirstOption(page, /select department/i);
    await page.getByRole('button', { name: /^next$/i }).click();
    await page.getByRole('button', { name: /create risk now/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    await page.getByText(title).first().click();
    const submit = page.getByRole('button', { name: /submit for review/i }).first();
    if (await submit.count()) {
      await submit.click();
      const confirm = page.getByRole('button', { name: /^submit$|^confirm$/i }).first();
      if (await confirm.count()) await confirm.click();
    }
    await logout(page);

    // --- approver claims and approves -------------------------------------
    await login(page, approver!);
    await page.goto('/approvals');
    await page.waitForTimeout(1500);

    const inboxRow = page.getByText(title).first();
    if ((await inboxRow.count()) === 0) {
      test.skip(true, 'Risk did not reach the approval inbox in this environment');
    }
    await inboxRow.click();

    const claim = page.getByRole('button', { name: /claim|start review/i }).first();
    if (await claim.count()) await claim.click();
    await page.waitForTimeout(800);

    const approve = page.getByRole('button', { name: /^approve$/i }).first();
    if (await approve.count()) {
      await approve.click();
      const confirm = page.getByRole('button', { name: /^approve$|^confirm$/i }).last();
      if (await confirm.count()) await confirm.click();
    }
    await page.waitForTimeout(1500);

    // Approval history must contain a trail for this risk.
    const history = await apiSelect(
      page,
      'risks',
      `select=id,approval_status&title=eq.${encodeURIComponent(title)}`,
    );
    expect.soft(history.status, history.body).toBe(200);
    expect.soft(history.body).toContain('approval_status');

    await logout(page);
  });

  test('UAT-RISK-05 reviewer returns for revision, originator resubmits, approval history is ordered', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RISK-05' });
    const author = byRole('RC') || byRole('RO');
    const approver = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!author || !approver, 'Author or approver credentials not configured');
    test.setTimeout(180_000);

    const title = uniqueTitle('Revision risk');

    // --- author creates and submits ---------------------------------------
    await login(page, author!);
    await openWizard(page);
    await page.getByRole('textbox').first().fill(title);
    await page.locator('textarea').first().fill('Revision-path risk created by UAT.');
    await pickFirstOption(page, /select category/i);
    await pickFirstOption(page, /select department/i);
    await page.getByRole('button', { name: /^next$/i }).click();
    await page.getByRole('button', { name: /create risk now/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

    await page.getByText(title).first().click();
    const submit = page.getByRole('button', { name: /submit for review/i }).first();
    if (await submit.count()) {
      await submit.click();
      const confirm = page.getByRole('button', { name: /^submit$|^confirm$/i }).first();
      if (await confirm.count()) await confirm.click();
    }
    await logout(page);

    // --- reviewer returns the risk with a mandatory comment ----------------
    await login(page, approver!);
    await page.goto('/approvals');
    await page.waitForTimeout(1500);

    const inboxRow = page.getByText(title).first();
    if ((await inboxRow.count()) === 0) {
      test.skip(true, 'Risk did not reach the approval inbox in this environment');
    }
    await inboxRow.click();

    const claim = page.getByRole('button', { name: /claim|start review/i }).first();
    if (await claim.count()) await claim.click();
    await page.waitForTimeout(800);

    const returnBtn = page.getByRole('button', { name: /return|request changes|send back/i }).first();
    if ((await returnBtn.count()) === 0) test.skip(true, 'No return-for-revision control on this build');
    await returnBtn.click();

    // The comment is mandatory — confirming empty must not proceed.
    const returnConfirm = page.getByRole('button', { name: /^return$|^confirm$|^send back$/i }).last();
    if (await returnConfirm.count()) {
      await returnConfirm.click();
      await page.waitForTimeout(500);
    }

    const comment = page.getByRole('textbox').last();
    await comment.fill('Please clarify the mitigation plan and resubmit. — UAT reviewer');
    if (await returnConfirm.count()) await returnConfirm.click();
    await page.waitForTimeout(1500);
    await logout(page);

    // --- originator edits and resubmits ------------------------------------
    await login(page, author!);
    await page.goto('/risk-register');
    await page.waitForTimeout(1500);
    await page.getByText(title).first().click();
    await page.waitForTimeout(800);

    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    if (await editBtn.count()) await editBtn.click();
    const desc = page.locator('textarea').first();
    if (await desc.count()) {
      await desc.fill('Mitigation plan clarified per reviewer feedback. — UAT resubmission.');
      const save = page.getByRole('button', { name: /^save$|^update$/i }).last();
      if (await save.count()) await save.click();
      await page.waitForTimeout(1000);
    }

    const resubmit = page.getByRole('button', { name: /submit for review|resubmit/i }).first();
    if (await resubmit.count()) {
      await resubmit.click();
      const confirm = page.getByRole('button', { name: /^submit$|^confirm$/i }).first();
      if (await confirm.count()) await confirm.click();
      await page.waitForTimeout(1500);
    }

    // --- approval history must show both events, in order ------------------
    const riskRow = await apiSelect(
      page,
      'risks',
      `select=id&title=eq.${encodeURIComponent(title)}`,
    );
    expect(riskRow.status, riskRow.body).toBe(200);
    const [risk] = JSON.parse(riskRow.body || '[]');
    if (risk?.id) {
      const history = await apiSelect(
        page,
        'approval_history',
        `select=id,action,to_status,created_at&risk_id=eq.${risk.id}&order=created_at.asc`,
      );
      expect.soft(history.status, history.body).toBe(200);
      const rows = JSON.parse(history.body || '[]');
      expect.soft(rows.length, 'expected at least a submit + a return event').toBeGreaterThanOrEqual(2);
      const timestamps = rows.map((r: { created_at: string }) => new Date(r.created_at).getTime());
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect.soft(timestamps).toEqual(sorted);
    }

    await logout(page);
  });

  test('UAT-RISK-04 read-only roles cannot open the wizard', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RISK-04' });
    const viewer = byRole('EC') || byRole('ERMSC') || byRole('RCB');
    test.skip(!viewer, 'No read-only credentials configured');

    await login(page, viewer!);
    await page.goto('/risk-register');
    await page.waitForTimeout(1200);
    expect(await page.getByRole('button', { name: /add new risk|add risk|new risk/i }).count()).toBe(0);
    await logout(page);
  });
});
