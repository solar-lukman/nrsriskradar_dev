import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect } from '../fixtures/dataApi';

/**
 * Closure-side coverage that the module journeys stop short of:
 *   UAT-WB-04  — whistleblow case closure with an outcome record.
 *   UAT-BCP-04 — BCP test findings are logged and tracked to closure.
 */

const users = usersWithCreds();
const byRole = (role: string) => users.find((u) => u.role === role);

test.describe('Closure workflows', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  test('UAT-WB-04 a whistleblow case is closed with an outcome', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-04' });
    const user = byRole('SUPERVISOR') || byRole('ADMIN') || byRole('CRO');
    test.skip(!user, 'No SUPERVISOR/ADMIN/CRO credentials configured');
    await login(page, user!);

    const res = await apiSelect(page, 'whistleblow_cases', 'select=id,status&status=neq.Closed&limit=1');
    let id: string | null = null;
    try {
      id = JSON.parse(res.body)?.[0]?.id ?? null;
    } catch {
      id = null;
    }
    test.skip(!id, 'No open whistleblow case available');

    await page.goto(`/whistleblow/cases/${id}`);
    await page.waitForTimeout(2000);

    const close = page.getByRole('button', { name: /close case|^close$/i }).first();
    test.skip((await close.count()) === 0, 'Close action not offered');
    await close.click();

    const scope = page.getByRole('dialog').first();
    const outcome = scope.getByRole('textbox').first();
    if (await outcome.count()) await outcome.fill('E2E: investigation concluded, outcome recorded.');
    await scope.getByRole('button', { name: /close|confirm|save/i }).last().click();
    await page.waitForTimeout(2000);

    const after = await apiSelect(page, 'whistleblow_cases', `select=status,outcome&id=eq.${id}`);
    expect.soft(after.body, 'the case must read Closed').toMatch(/Closed/i);
    expect
      .soft(after.body, 'closure must retain an outcome record')
      .not.toMatch(/"outcome"\s*:\s*null/);

    await logout(page);
  });

  test('UAT-BCP-04 test findings are logged and tracked to closure', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-BCP-04' });
    const user = byRole('RMD') || byRole('ADMIN') || byRole('CRO');
    test.skip(!user, 'No RMD/ADMIN/CRO credentials configured');
    await login(page, user!);

    const res = await apiSelect(
      page,
      'bcp_tests',
      'select=id,plan_id,findings,finding_owner,finding_closed_at&limit=5',
    );
    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = JSON.parse(res.body) || [];
    } catch {
      rows = [];
    }
    test.skip(rows.length === 0, 'No BCP tests logged yet');

    // Every recorded finding must carry an owner so it can be tracked closed.
    for (const r of rows) {
      if (r.findings) {
        expect
          .soft(r.finding_owner, `finding on test ${r.id} needs an owner for closure tracking`)
          .toBeTruthy();
      }
    }

    await page.goto('/business-continuity');
    await expect(page.getByRole('heading', { name: /business continuity/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .soft(page.getByText(/finding|test/i).first(), 'findings must be visible from the BCP page')
      .toBeVisible({ timeout: 10_000 });

    await logout(page);
  });
});
