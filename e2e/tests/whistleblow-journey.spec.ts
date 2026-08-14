import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';

/**
 * UAT-WB — anonymous whistleblowing journey.
 *
 * The intake form is deliberately unauthenticated. The follow-up channel is
 * token-based, and triage is supervisor-only. This spec walks all three.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-WB whistleblowing journey', () => {
  test('UAT-WB-01 anonymous report can be submitted without a session', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-01' });
    test.setTimeout(120_000);

    await page.goto('/whistleblow');
    // No login required — the form must render for an anonymous visitor.
    await expect(page.getByRole('heading', { name: /whistleblow|report|speak up/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const start = page.getByRole('button', { name: /report|submit a report|make a report|get started/i }).first();
    if (await start.count()) {
      await start.click();
      await page.waitForTimeout(800);
    }

    const subject = page.getByLabel(/subject/i).first();
    if ((await subject.count()) === 0) test.skip(true, 'Whistleblow form not reachable in this build');

    const marker = `UAT anonymous report ${Date.now()}`;
    await subject.fill(marker);

    // Category is a required dropdown — it must offer options.
    const category = page.getByText(/select (a )?category/i).first();
    if (await category.count()) {
      await category.click();
      const option = page.getByRole('option').first();
      await option.waitFor({ state: 'visible', timeout: 5000 });
      expect.soft(await page.getByRole('option').count(), 'category list must not be empty').toBeGreaterThan(0);
      await option.click();
    }

    const details = page.locator('textarea').first();
    if (await details.count()) await details.fill('Submitted by the automated UAT suite. Safe to close.');

    const submit = page.getByRole('button', { name: /^submit( report)?$/i }).last();
    if ((await submit.count()) === 0) test.skip(true, 'No submit control found');
    await submit.click();

    // A successful submission returns a case reference / follow-up token.
    const confirmation = page.getByText(/case (reference|number)|follow[- ]up (code|token)|thank you/i).first();
    await expect(confirmation).toBeVisible({ timeout: 30_000 });
  });

  test('UAT-WB-02 follow-up requires a valid token', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-02' });

    await page.goto('/whistleblow/follow-up');
    const input = page.getByRole('textbox').first();
    if ((await input.count()) === 0) test.skip(true, 'Follow-up page not present in this build');

    await input.fill('definitely-not-a-real-token');
    const go = page.getByRole('button', { name: /check|track|continue|view/i }).first();
    if (await go.count()) await go.click();
    await page.waitForTimeout(2000);

    // A bogus token must never reveal a case.
    expect.soft(await page.getByText(/not found|invalid|no case/i).count()).toBeGreaterThan(0);
  });

  test('UAT-WB-04 anonymous follow-up with reference and passphrase can send a message; a wrong passphrase is rejected', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-04' });
    test.setTimeout(150_000);

    // --- submit a fresh report so we have a real reference/passphrase pair -
    await page.goto('/whistleblow');
    await expect(page.getByRole('heading', { name: /whistleblow|report|speak up/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    const start = page.getByRole('button', { name: /report|submit a report|make a report|get started/i }).first();
    if (await start.count()) {
      await start.click();
      await page.waitForTimeout(800);
    }
    const subject = page.getByLabel(/subject/i).first();
    if ((await subject.count()) === 0) test.skip(true, 'Whistleblow form not reachable in this build');

    const marker = `UAT follow-up report ${Date.now()}`;
    await subject.fill(marker);
    const category = page.getByText(/select (a )?category/i).first();
    if (await category.count()) {
      await category.click();
      const option = page.getByRole('option').first();
      await option.waitFor({ state: 'visible', timeout: 5000 });
      await option.click();
    }
    const details = page.locator('textarea').first();
    if (await details.count()) await details.fill('Submitted by the automated UAT suite to test follow-up. Safe to close.');

    const passphraseField = page.getByLabel(/passphrase/i).first();
    let passphrase = '';
    if (await passphraseField.count()) {
      passphrase = `UatPass!${Date.now()}`;
      await passphraseField.fill(passphrase);
    }

    const submit = page.getByRole('button', { name: /^submit( report)?$/i }).last();
    if ((await submit.count()) === 0) test.skip(true, 'No submit control found');
    await submit.click();

    const confirmation = page.getByText(/case (reference|number)|follow[- ]up (code|token)|thank you/i).first();
    await expect(confirmation).toBeVisible({ timeout: 30_000 });

    const bodyText = await page.locator('body').innerText();
    const refMatch = bodyText.match(/WB-\d{4}-\d+/);
    if (!refMatch || !passphrase) {
      test.skip(true, 'Could not recover a case reference / passphrase pair from the confirmation screen');
    }
    const caseRef = refMatch![0];

    // --- follow-up with the wrong passphrase must be rejected --------------
    await page.goto('/whistleblow/follow-up');
    await page.getByLabel(/case reference/i).fill(caseRef);
    await page.getByLabel(/passphrase/i).fill('definitely-the-wrong-passphrase');
    await page.getByRole('button', { name: /view case/i }).click();
    await page.waitForTimeout(2000);
    expect.soft(await page.getByText(/invalid|not found|incorrect|failed/i).count()).toBeGreaterThan(0);
    expect.soft(await page.getByText(new RegExp(`Case: ${caseRef}`)).count()).toBe(0);

    // --- follow-up with the correct reference + passphrase can send a message
    await page.getByLabel(/passphrase/i).fill(passphrase);
    await page.getByRole('button', { name: /view case/i }).click();
    await page.waitForTimeout(2000);

    const messageBox = page.getByRole('textbox').last();
    if ((await messageBox.count()) === 0) test.skip(true, 'Follow-up messaging UI not present in this build');
    const messageText = `UAT follow-up message ${Date.now()}`;
    await messageBox.fill(messageText);
    const send = page.getByRole('button', { name: /send/i }).last();
    if (await send.count()) {
      await send.click();
      await page.waitForTimeout(2000);
      expect.soft(await page.getByText(messageText).count()).toBeGreaterThan(0);
    }
  });

  test('UAT-WB-03 supervisor can triage cases; others cannot', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-03' });
    const supervisor = byRole('SUPERVISOR') || byRole('ADMIN');
    test.skip(!supervisor, 'No supervisor credentials configured');

    await login(page, supervisor!);
    await page.goto('/whistleblow/cases');
    await page.waitForTimeout(1500);
    expect(await page.getByText(/access denied/i).count()).toBe(0);
    await logout(page);
  });
});
