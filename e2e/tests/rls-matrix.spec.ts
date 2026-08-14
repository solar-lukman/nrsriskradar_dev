import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout } from '../fixtures/auth';
import { apiSelect, apiUpdate, isAllowed, isDenied } from '../fixtures/dataApi';
import { RLS_MATRIX, IMPOSSIBLE_FILTER, expectedRead, expectedWrite } from '../fixtures/rlsMatrix';

/**
 * Tier 3 — RLS matrix enforcement.
 *
 * Every (table, role) pair in e2e/fixtures/rlsMatrix.ts is probed through the
 * Data API using the role's real JWT. This is the authoritative check: the UI
 * may hide a button, but only the database can actually stop a request.
 */
const users = usersWithCreds();

test.describe('UAT-RLS Data API matrix', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test(`UAT-RLS-01 [${user.role}] table access matches the RLS matrix`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-RLS-01' });
      testInfo.annotations.push({ type: 'role', description: user.role });
      test.setTimeout(120_000);

      await login(page, user);

      for (const t of RLS_MATRIX) {
        const read = await apiSelect(page, t.table);
        const wantRead = expectedRead(t, user.role);
        if (wantRead === 'allow') {
          expect.soft(
            isAllowed(read),
            `${user.role} should be able to SELECT ${t.table} (got ${read.status} ${read.body.slice(0, 160)})`,
          ).toBe(true);
        } else {
          expect.soft(
            !isAllowed(read) || read.body === '[]',
            `${user.role} must NOT read ${t.table} (got ${read.status} ${read.body.slice(0, 160)})`,
          ).toBe(true);
        }

        if (t.readOnly) {
          // Append-only tables: nobody may UPDATE, not even ADMIN.
          const w = await apiUpdate(page, t.table, IMPOSSIBLE_FILTER, {
            [t.writeColumn]: 'e2e-should-never-apply',
          });
          expect.soft(
            isDenied(w),
            `${t.table} must be append-only for ${user.role} (got ${w.status} ${w.body.slice(0, 160)})`,
          ).toBe(true);
          continue;
        }

        const write = await apiUpdate(page, t.table, IMPOSSIBLE_FILTER, {
          [t.writeColumn]: 'e2e-rls-probe',
        });
        const wantWrite = expectedWrite(t, user.role);
        if (wantWrite === 'deny') {
          expect.soft(
            isDenied(write),
            `${user.role} must NOT be allowed to UPDATE ${t.table} (got ${write.status} ${write.body.slice(0, 160)})`,
          ).toBe(true);
        } else {
          // Allowed roles hit a non-existent row, so PostgREST answers 200 [].
          // What must never happen is a permission error.
          expect
            .soft(
              !/permission denied|violates row-level security/i.test(write.body),
              `${user.role} should be permitted to UPDATE ${t.table} (got ${write.status} ${write.body.slice(0, 160)})`,
            )
            .toBe(true);
        }
      }

      await logout(page);
    });
  }

  // Privilege escalation is the single highest-impact failure mode.
  test('UAT-RLS-02 non-admin cannot grant themselves ADMIN', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-RLS-02' });
    const victim = users.find((u) => u.role === 'RC') || users.find((u) => u.role !== 'ADMIN');
    test.skip(!victim, 'No non-admin credentials configured');
    await login(page, victim!);

    const insert = await page.evaluate(async () => {
      const env = (import.meta as unknown as { env: Record<string, string> }).env || {};
      const session = Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .map((k) => JSON.parse(localStorage.getItem(k) || '{}'))[0];
      const token = session?.access_token;
      const uid = session?.user?.id;
      if (!token || !uid) return { status: 0, body: 'no-session' };
      const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/user_roles`, {
        method: 'POST',
        headers: {
          apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ user_id: uid, role: 'ADMIN', assigned_by: uid }),
      });
      return { status: res.status, body: await res.text() };
    });

    expect(
      insert.status >= 400,
      `Self-escalation must be rejected (got ${insert.status} ${insert.body.slice(0, 200)})`,
    ).toBe(true);
    await logout(page);
  });
});
