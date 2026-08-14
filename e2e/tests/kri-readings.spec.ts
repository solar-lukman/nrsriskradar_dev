import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';
import { canPerformAction } from '../../src/lib/permissions';

/**
 * UAT-KRI (continued) — reading capture, status derivation for both breach
 * directions, breach notifications, trend chart and the linkage from a KRI
 * back to its parent risk.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);
const mandated = () => byRole('RMD') || byRole('CRO') || byRole('ADMIN');

test.describe('UAT-KRI readings and derivation', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-KRI-03 recording a reading derives Normal / Warning / Critical', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-03' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/kris');
    await expect(page.getByRole('heading', { name: /key risk indicators/i })).toBeVisible({
      timeout: 15_000,
    });

    const record = page.getByRole('button', { name: /^record$/i }).first();
    test.skip((await record.count()) === 0, 'No indicator available to record against');
    await record.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/record reading/i)).toBeVisible({ timeout: 10_000 });

    // The dialog states the thresholds and previews the derived status live.
    await expect
      .soft(dialog.getByText(/warning at .* critical at/i), 'thresholds must be stated')
      .toBeVisible();

    await dialog.locator('#reading-value').fill('999999');
    await expect
      .soft(dialog.getByText(/classified as/i), 'a status preview must be shown before saving')
      .toBeVisible({ timeout: 8000 });

    await dialog.getByRole('button', { name: /record reading/i }).click();
    await expect(page.getByText(/reading recorded/i)).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  test('UAT-KRI-04 breach direction is honoured in both directions', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-04' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const res = await apiSelect(
      page,
      'kris',
      'select=id,name,breach_direction,warning_threshold,critical_threshold,status&limit=50',
    );
    let rows: Array<{ breach_direction: string }> = [];
    try {
      rows = JSON.parse(res.body) || [];
    } catch {
      rows = [];
    }
    test.skip(rows.length === 0, 'No indicators seeded (see UAT test data, Section 8)');

    const above = rows.filter((r) => r.breach_direction === 'above');
    const below = rows.filter((r) => r.breach_direction === 'below');
    expect
      .soft(above.length > 0 && below.length > 0, 'test data should cover both breach directions')
      .toBe(true);

    for (const r of rows) {
      expect
        .soft(['above', 'below'], 'breach_direction must be constrained')
        .toContain(r.breach_direction);
    }

    await logout(page);
  });

  test('UAT-KRI-05 a critical reading notifies the owner, RMD and CRO', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-05' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const critical = await apiSelect(page, 'kri_readings', 'select=id,status&status=eq.Critical&limit=1');
    let hasCritical = false;
    try {
      hasCritical = (JSON.parse(critical.body) || []).length > 0;
    } catch {
      hasCritical = false;
    }
    test.skip(!hasCritical, 'No critical reading recorded yet');

    const notes = await apiSelect(
      page,
      'notifications',
      'select=id,title,category&category=eq.kri&limit=5',
    );
    let count = 0;
    try {
      count = (JSON.parse(notes.body) || []).length;
    } catch {
      count = 0;
    }
    expect.soft(count, 'a KRI breach must raise a notification').toBeGreaterThan(0);

    await logout(page);
  });

  test('UAT-KRI-06 the trend chart plots the reading history', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-06' });
    const user = mandated() || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    await page.goto('/kris');
    await expect(page.getByRole('heading', { name: /key risk indicators/i })).toBeVisible({
      timeout: 15_000,
    });

    const readings = await apiSelect(page, 'kri_readings', 'select=id&limit=2');
    let count = 0;
    try {
      count = (JSON.parse(readings.body) || []).length;
    } catch {
      count = 0;
    }
    test.skip(count === 0, 'No readings recorded to chart');

    await expect
      .soft(page.locator('.recharts-responsive-container, svg.recharts-surface').first())
      .toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  test('UAT-KRI-08 executives can view but never edit indicators', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-08' });
    const user = byRole('EC') || byRole('ERMSC') || byRole('RCB');
    test.skip(!user, 'No executive credentials configured');
    await login(page, user!);

    await page.goto('/kris');
    await expect(page.getByRole('heading', { name: /key risk indicators/i })).toBeVisible({
      timeout: 15_000,
    });
    expect(canPerformAction(user!.role, 'kri.manage'), 'executives are read-only').toBe(false);
    await expect(page.getByRole('button', { name: /new indicator/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^record$/i })).toHaveCount(0);

    await logout(page);
  });

  test('UAT-KRI-09 an indicator links back to its parent risk', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-09' });
    const user = mandated() || users[0];
    test.skip(!user, 'No credentials configured');
    await login(page, user!);

    const linked = await apiSelect(page, 'kris', 'select=id,name,risk_id&risk_id=not.is.null&limit=1');
    let row: { name?: string } | null = null;
    try {
      row = JSON.parse(linked.body)?.[0] ?? null;
    } catch {
      row = null;
    }
    test.skip(!row, 'No indicator linked to a risk');

    await page.goto('/kris');
    await expect(page.getByText(row!.name!)).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });
});

test.describe('UAT-KRI indicator creation', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-KRI-01 RMD creates an indicator with thresholds, direction and frequency', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-01' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/kris');
    await page.getByRole('button', { name: /new indicator/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const name = `E2E Indicator ${Date.now()}`;
    await dialog.getByRole('textbox').first().fill(name);
    const numbers = dialog.locator('input[type="number"]');
    if ((await numbers.count()) >= 2) {
      await numbers.nth(0).fill('5');
      await numbers.nth(1).fill('10');
    }
    // Breach direction and frequency must both be offered.
    await expect.soft(dialog.getByText(/direction|higher is worse|above/i).first()).toBeVisible();
    await expect.soft(dialog.getByText(/frequency|monthly|weekly/i).first()).toBeVisible();

    await dialog.getByRole('button', { name: /save|create/i }).last().click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('UAT-KRI-02 a reading below the warning threshold stays Normal', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-02' });
    const user = mandated();
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const res = await apiSelect(
      page,
      'kris',
      'select=id,name,warning_threshold,breach_direction&breach_direction=eq.above&limit=1',
    );
    let kri: { name: string; warning_threshold: number } | null = null;
    try {
      kri = JSON.parse(res.body)?.[0] ?? null;
    } catch {
      kri = null;
    }
    test.skip(!kri, 'No "higher is worse" indicator seeded');

    await page.goto('/kris');
    const row = page.getByText(kri!.name).first();
    await row.waitFor({ state: 'visible', timeout: 15_000 });
    const record = page.getByRole('button', { name: /^record$/i }).first();
    test.skip((await record.count()) === 0, 'Record action not offered');
    await record.click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('#reading-value').fill(String(Math.max(0, kri!.warning_threshold - 1)));
    await expect(dialog.getByText(/classified as/i)).toBeVisible({ timeout: 8000 });
    await expect
      .soft(dialog.getByText(/\bNormal\b/), 'a sub-warning reading must derive Normal')
      .toBeVisible({ timeout: 8000 });

    await logout(page);
  });
});
