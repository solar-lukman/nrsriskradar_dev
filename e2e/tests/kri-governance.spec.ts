import { test, expect } from '@playwright/test';
import { usersWithCreds, type TestUser } from '../fixtures/users';
import { login, logout, isAccessDenied } from '../fixtures/auth';
import { apiSelect, apiInsert, isAllowed, isDenied } from '../fixtures/dataApi';
import { canPerformAction } from '../../src/lib/permissions';

/**
 * KRI + Governance Decision coverage added after the RMD UAT feedback.
 *
 * UAT-KRI-01/02/03 — /kris route visibility, indicator register, and the
 *   RMD-mandate model: only RMD / CRO / ADMIN may create indicators or
 *   record readings (Champions / Reviewers / Owners are read-only).
 * UAT-GOV-01/02   — the Committee Decisions panel on a risk: the
 *   "Record decision" action is restricted to RMD / CRO / ADMIN.
 * UAT-RLS-KRI     — server-side proof that crafted INSERTs against kris,
 *   kri_readings and risk_governance_decisions are refused for
 *   non-mandated roles (the UI hiding a button is not the boundary).
 */

const users = usersWithCreds();

function byRole(role: string): TestUser | undefined {
  return users.find((u) => u.role === role);
}

test.describe('KRI route & role restrictions (UAT-KRI)', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test(`UAT-KRI-01 [${user.role}] /kris route and action gating match the matrix`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-07' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);

      await page.goto('/kris');
      await page.waitForTimeout(1200);

      const denied = await isAccessDenied(page);
      // /kris requires view_risks — every authenticated role has it, so nobody
      // should hit Access Denied here.
      expect.soft(denied, `${user.role} unexpectedly denied on /kris`).toBe(false);

      const heading = page.getByRole('heading', { name: /key risk indicators/i });
      await expect(heading).toBeVisible({ timeout: 10_000 });

      const wantManage = canPerformAction(user.role, 'kri.manage');
      const newBtn = page.getByRole('button', { name: /new indicator/i });
      if (wantManage) {
        await expect.soft(newBtn, `${user.role} should see New Indicator`).toBeVisible();
      } else {
        await expect
          .soft(newBtn, `${user.role} must NOT see New Indicator`)
          .toHaveCount(0);
      }

      // "Record" buttons only render for kri.record_reading roles, and only
      // when indicators exist — so absence is the assertion for denied roles.
      const wantRecord = canPerformAction(user.role, 'kri.record_reading');
      const recordBtns = page.getByRole('button', { name: /^record$/i });
      if (!wantRecord) {
        await expect
          .soft(recordBtns, `${user.role} must NOT see Record reading buttons`)
          .toHaveCount(0);
      }

      await logout(page);
    });
  }

  test('UAT-KRI-02 [RMD] can open the New Indicator dialog', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-KRI-extra-dialog' });
    const rmd = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!rmd, 'No RMD/CRO/ADMIN credentials configured');
    await login(page, rmd!);
    await page.goto('/kris');
    await page.getByRole('button', { name: /new indicator/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });
});

test.describe('Governance decision panel (UAT-GOV)', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const role of ['RMD', 'CRO', 'ADMIN', 'RC', 'RR', 'RO'] as const) {
    test(`UAT-GOV-01 [${role}] Record decision visibility matches the matrix`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-05' });
      testInfo.annotations.push({ type: 'role', description: role });
      const user = byRole(role);
      test.skip(!user, `No ${role} credentials configured`);

      await login(page, user!);

      // Find any visible risk and deep-link into its view dialog.
      const risk = await apiSelect(page, 'risks', 'select=id&limit=1');
      let riskId: string | null = null;
      try {
        riskId = JSON.parse(risk.body)?.[0]?.id ?? null;
      } catch {
        riskId = null;
      }
      test.skip(!riskId, 'No risks visible to this role — cannot open view dialog');

      await page.goto(`/risk-register?view=${riskId}`);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      // The Committee Decisions panel is part of the view dialog for everyone
      // who can see the risk; only the action button is gated.
      await expect
        .soft(dialog.getByText(/committee decisions/i))
        .toBeVisible({ timeout: 10_000 });

      const wantRecord = canPerformAction(user!.role, 'governance.record_decision');
      const recordBtn = dialog.getByRole('button', { name: /record decision/i });
      if (wantRecord) {
        await expect
          .soft(recordBtn, `${role} should see Record decision`)
          .toBeVisible();
      } else {
        await expect
          .soft(recordBtn, `${role} must NOT see Record decision`)
          .toHaveCount(0);
      }

      await logout(page);
    });
  }

  test('UAT-GOV-02 [RMD] recording a decision requires a rationale of 10+ chars', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-GOV-03' });
    const user = byRole('RMD') || byRole('CRO') || byRole('ADMIN');
    test.skip(!user, 'No RMD/CRO/ADMIN credentials configured');

    await login(page, user!);
    const risk = await apiSelect(page, 'risks', 'select=id&limit=1');
    let riskId: string | null = null;
    try {
      riskId = JSON.parse(risk.body)?.[0]?.id ?? null;
    } catch {
      riskId = null;
    }
    test.skip(!riskId, 'No risks visible — cannot open view dialog');

    await page.goto(`/risk-register?view=${riskId}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole('button', { name: /record decision/i }).click();
    await dialog.locator('#gd-rationale').fill('short');
    await dialog.getByRole('button', { name: /save decision/i }).click();

    await expect(
      dialog.getByText(/rationale must be at least 10 characters/i),
    ).toBeVisible();

    await logout(page);
  });
});

test.describe('KRI / governance RLS probes (UAT-RLS-KRI)', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test(`UAT-RLS-KRI [${user.role}] crafted INSERTs are refused for non-mandated roles`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-RLS-KRI' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      await login(page, user);

      const canManageKri = canPerformAction(user.role, 'kri.manage');
      const canRecordReading = canPerformAction(user.role, 'kri.record_reading');
      const canRecordDecision = canPerformAction(user.role, 'governance.record_decision');

      // SELECTs: all three tables are readable by every authenticated role.
      for (const table of ['kris', 'kri_readings', 'risk_governance_decisions']) {
        const read = await apiSelect(page, table);
        expect.soft(
          isAllowed(read),
          `${user.role} should SELECT ${table} (got ${read.status} ${read.body.slice(0, 160)})`,
        ).toBe(true);
      }

      // INSERT into kris — only RMD / CRO / ADMIN may create indicators.
      const kriInsert = await apiInsert(page, 'kris', {
        name: 'e2e-rls-probe',
        unit: '%',
        warning_threshold: 1,
        critical_threshold: 2,
        breach_direction: 'above',
        measurement_frequency: 'Monthly',
      });
      if (canManageKri) {
        // Permitted roles may succeed; clean up immediately if a row was created.
        if (isAllowed(kriInsert)) {
          try {
            const created = JSON.parse(kriInsert.body)?.[0];
            if (created?.id) {
              await page.evaluate(async (id) => {
                const env = (import.meta as unknown as { env: Record<string, string> }).env || {};
                const session = Object.keys(localStorage)
                  .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
                  .map((k) => JSON.parse(localStorage.getItem(k) || '{}'))[0];
                await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/kris?id=eq.${id}`, {
                  method: 'DELETE',
                  headers: {
                    apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${session?.access_token}`,
                  },
                });
              }, created.id);
            }
          } catch {
            /* cleanup best-effort */
          }
        }
      } else {
        expect.soft(
          isDenied(kriInsert),
          `${user.role} must NOT INSERT into kris (got ${kriInsert.status} ${kriInsert.body.slice(0, 160)})`,
        ).toBe(true);
      }

      // INSERT into kri_readings — needs a real kri_id; only probe the deny
      // path for roles outside the mandate (a fake id fails on FK for allowed
      // roles, which proves nothing about policy).
      if (!canRecordReading) {
        const readingInsert = await apiInsert(page, 'kri_readings', {
          kri_id: '00000000-0000-0000-0000-000000000000',
          value: 1,
          reading_date: '2026-01-01',
        });
        expect.soft(
          isDenied(readingInsert),
          `${user.role} must NOT INSERT into kri_readings (got ${readingInsert.status} ${readingInsert.body.slice(0, 160)})`,
        ).toBe(true);
      }

      // INSERT into risk_governance_decisions — decided_by must be self AND
      // the caller must hold a governance role.
      if (!canRecordDecision) {
        const decisionInsert = await apiInsert(page, 'risk_governance_decisions', {
          risk_id: '00000000-0000-0000-0000-000000000000',
          decision_type: 'Note',
          forum: 'ERMSC',
          decision_date: '2026-01-01',
          rationale: 'e2e rls probe rationale',
        });
        expect.soft(
          isDenied(decisionInsert),
          `${user.role} must NOT INSERT into risk_governance_decisions (got ${decisionInsert.status} ${decisionInsert.body.slice(0, 160)})`,
        ).toBe(true);
      }

      await logout(page);
    });
  }
});
