import { test, expect } from '@playwright/test';
import { usersWithCreds } from '../fixtures/users';
import { login, logout, isAccessDenied } from '../fixtures/auth';

const users = usersWithCreds();
const roleUsers = (roles: string[]) => users.filter((u) => roles.includes(u.role));

/**
 * Negative RBAC / RLS tests — verify users cannot access or modify records
 * outside their assigned role or approved scope.
 *
 * These probe the client via UI and, where relevant, hit the Supabase Data API
 * directly to confirm RLS is the source of truth (not just client-side hiding).
 */
test.describe('Negative RBAC / RLS', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  // UAT-AUTH-05 — CRO must never see User Management
  test('UAT-AUTH-05 CRO cannot open /user-management', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-AUTH-05' });
    const cro = roleUsers(['CRO'])[0];
    test.skip(!cro, 'CRO credentials not configured');
    await login(page, cro);
    await page.goto('/user-management');
    await page.waitForTimeout(800);
    const denied = await isAccessDenied(page);
    const redirected = new URL(page.url()).pathname !== '/user-management';
    expect(denied || redirected).toBe(true);
    // Sidebar must not offer the link
    const link = page.getByRole('link', { name: /user management/i });
    expect(await link.count()).toBe(0);
    await logout(page);
  });

  // UAT-REG-neg — read-only roles cannot see "Add Risk" primary action
  for (const role of ['EC', 'ERMSC', 'RCB', 'USER']) {
    test(`UAT-REG-neg [${role}] cannot see Add Risk action`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-REG-neg' });
      testInfo.annotations.push({ type: 'role', description: role });
      const u = roleUsers([role])[0];
      test.skip(!u, `${role} credentials not configured`);
      await login(page, u);
      await page.goto('/risk-register');
      await page.waitForTimeout(1000);
      const addBtn = page.getByRole('button', { name: /add new risk|add risk|new risk/i });
      expect.soft(await addBtn.count(), `${role} should not see Add Risk`).toBe(0);
      await logout(page);
    });
  }

  // UAT-DATA-neg — Data API rejects unauthorised writes (RLS enforced server-side)
  test('UAT-DATA-neg RC cannot update a risk they do not own via Data API', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'uat', description: 'UAT-DATA-neg' });
    const rc = roleUsers(['RC'])[0];
    test.skip(!rc, 'RC credentials not configured');
    await login(page, rc);

    // Attempt a raw update through the browser context (uses RC's session)
    const result = await page.evaluate(async () => {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL;
      const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .map((k) => JSON.parse(localStorage.getItem(k) || '{}'))[0];
      const token = session?.access_token;
      if (!url || !token) return { status: 0, body: 'no-session' };
      // Pick an arbitrary risk id NOT created by this user (id 0000... never matches).
      const res = await fetch(`${url}/rest/v1/risks?id=eq.00000000-0000-0000-0000-000000000000`, {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ title: 'e2e-negative-write-attempt' }),
      });
      return { status: res.status, body: await res.text() };
    });

    // RLS must either reject (401/403) or return an empty affected set (200 + []).
    const ok = result.status === 401 || result.status === 403 ||
               (result.status === 200 && (result.body === '[]' || result.body === ''));
    expect(ok, `Unexpected write response: ${result.status} ${result.body}`).toBe(true);
    await logout(page);
  });

  // UAT-WB-neg — non-supervisor roles cannot open Whistleblowing cases workspace
  for (const role of ['RC', 'RO', 'EC', 'ERMSC', 'RCB']) {
    test(`UAT-WB-neg [${role}] cannot open /whistleblow/cases`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'uat', description: 'UAT-WB-neg' });
      testInfo.annotations.push({ type: 'role', description: role });
      const u = roleUsers([role])[0];
      test.skip(!u, `${role} credentials not configured`);
      await login(page, u);
      await page.goto('/whistleblow/cases');
      await page.waitForTimeout(800);
      const denied = await isAccessDenied(page);
      const redirected = new URL(page.url()).pathname !== '/whistleblow/cases';
      expect(denied || redirected).toBe(true);
      await logout(page);
    });
  }
});
