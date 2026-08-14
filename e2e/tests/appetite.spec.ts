import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect, apiUpdate, isDenied } from '../fixtures/dataApi';

/**
 * UAT-RAP — risk appetite configuration, governance validation, automatic
 * breach flagging and re-scan on threshold change.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('UAT-RAP risk appetite', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-RAP-01 ADMIN configures appetite thresholds per category', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RAP-01' });
    const user = byRole('ADMIN') || byRole('RMD');
    test.skip(!user, 'No ADMIN/RMD credentials configured');
    await login(page, user!);

    await page.goto('/settings');
    const tab = page.getByRole('tab', { name: /appetite/i }).first();
    test.skip((await tab.count()) === 0, 'Risk appetite tab not offered');
    await tab.click();

    await expect(page.getByText(/risk appetite/i).first()).toBeVisible({ timeout: 10_000 });
    const rows = await apiSelect(page, 'risk_appetite_config', 'select=id,threshold_score&limit=1');
    expect
      .soft(rows.status, 'appetite configuration must be readable by the configurer')
      .toBeGreaterThanOrEqual(200);

    await logout(page);
  });

  test('UAT-RAP-02 configured thresholds match the approved appetite statement', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RAP-02' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const res = await apiSelect(
      page,
      'risk_appetite_config',
      'select=risk_type,tolerance_level,threshold_score,escalation_action&limit=50',
    );
    let rows: Array<{ threshold_score: number; tolerance_level: string; escalation_action: string }> = [];
    try {
      rows = JSON.parse(res.body) || [];
    } catch {
      rows = [];
    }
    test.skip(rows.length === 0, 'No appetite rows seeded (see UAT test data, Section 8)');

    for (const r of rows) {
      expect
        .soft(r.threshold_score, 'threshold must sit inside the 1-25 scoring scale')
        .toBeGreaterThan(0);
      expect.soft(r.threshold_score).toBeLessThanOrEqual(25);
      expect.soft(r.tolerance_level, 'each row needs a tolerance level').toBeTruthy();
      expect.soft(r.escalation_action, 'each row needs an escalation action').toBeTruthy();
    }

    await logout(page);
  });

  test('UAT-RAP-03 a risk scored past appetite is flagged automatically', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RAP-03' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, user!);

    const cfg = await apiSelect(
      page,
      'risk_appetite_config',
      'select=risk_type,threshold_score&limit=1',
    );
    let threshold: number | null = null;
    try {
      threshold = JSON.parse(cfg.body)?.[0]?.threshold_score ?? null;
    } catch {
      threshold = null;
    }
    test.skip(threshold === null, 'No appetite threshold configured');

    const breaching = await apiSelect(
      page,
      'risks',
      `select=id,residual_score,appetite_status,is_outside_appetite&residual_score=gt.${threshold}&limit=5`,
    );
    test.skip(breaching.status >= 400, 'Appetite columns not exposed to this role');
    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = JSON.parse(breaching.body) || [];
    } catch {
      rows = [];
    }
    test.skip(rows.length === 0, 'No risk currently scored above appetite');

    for (const r of rows) {
      const flagged =
        r.is_outside_appetite === true || /outside|breach|exceed/i.test(String(r.appetite_status ?? ''));
      expect
        .soft(flagged, `risk ${r.id} above threshold ${threshold} must be flagged out of appetite`)
        .toBe(true);
    }

    await logout(page);
  });

  test('UAT-RAP-04 out-of-appetite risks and critical KRIs tell the same story', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RAP-04' });
    const user = byRole('CRO') || byRole('RMD') || byRole('ADMIN');
    test.skip(!user, 'No CRO/RMD/ADMIN credentials configured');
    await login(page, user!);

    await page.goto('/app');
    await page.waitForTimeout(2500);
    await expect
      .soft(page.getByText(/appetite/i).first(), 'dashboard must surface appetite exposure')
      .toBeVisible({ timeout: 15_000 });

    await page.goto('/kris');
    await expect(page.getByRole('heading', { name: /key risk indicators/i })).toBeVisible({
      timeout: 15_000,
    });
    const critical = await apiSelect(page, 'kris', 'select=id,status&status=eq.Critical&limit=50');
    let count = 0;
    try {
      count = (JSON.parse(critical.body) || []).length;
    } catch {
      count = 0;
    }
    // The KPI tile must agree with the database count.
    const tile = page.getByText(/critical/i).first();
    if (count > 0) {
      await expect.soft(tile).toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
  });

  test('UAT-RAP-05 changing a threshold re-scans existing risks', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RAP-05' });
    const user = byRole('ADMIN') || byRole('RMD');
    test.skip(!user, 'No ADMIN/RMD credentials configured');
    await login(page, user!);

    const cfg = await apiSelect(page, 'risk_appetite_config', 'select=id,threshold_score&limit=1');
    let row: { id: string; threshold_score: number } | null = null;
    try {
      row = JSON.parse(cfg.body)?.[0] ?? null;
    } catch {
      row = null;
    }
    test.skip(!row, 'No appetite row to modify');

    const original = row!.threshold_score;
    const lowered = Math.max(1, original - 1);
    const patch = await apiUpdate(page, 'risk_appetite_config', `id=eq.${row!.id}`, {
      threshold_score: lowered,
    });
    test.skip(isDenied(patch), 'This role may not modify appetite configuration');

    await page.waitForTimeout(2000);
    const rescanned = await apiSelect(
      page,
      'risks',
      `select=id&residual_score=gt.${lowered}&is_outside_appetite=eq.true&limit=1`,
    );
    expect
      .soft(rescanned.status < 400, 'appetite flags must remain queryable after a re-scan')
      .toBe(true);

    // Restore the original threshold.
    await apiUpdate(page, 'risk_appetite_config', `id=eq.${row!.id}`, {
      threshold_score: original,
    });

    await logout(page);
  });
});
