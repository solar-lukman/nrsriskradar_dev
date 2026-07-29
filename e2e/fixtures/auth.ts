import { Page, expect } from '@playwright/test';
import type { TestUser } from '../fixtures/users';

export async function login(page: Page, user: TestUser) {
  await page.goto('/app');
  // LoginPage renders when unauthenticated (see src/pages/Index.tsx)
  await page.locator('#signin-email').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#signin-email').fill(user.email);
  await page.locator('#signin-password').fill(user.password);
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.getByRole('button', { name: /^sign in$/i }).click(),
  ]);
  // Wait for either redirect or dashboard-shell to appear
  await page.waitForTimeout(1500);
}

export async function logout(page: Page) {
  // Best-effort: clear supabase local storage to reset session
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('sb-'))
      .forEach((k) => window.localStorage.removeItem(k));
  });
}

/** Detect whether the current view is the AccessDenied component. */
export async function isAccessDenied(page: Page): Promise<boolean> {
  const denied = page.getByText(/access denied|you (do not|don't) have permission/i);
  try {
    await denied.first().waitFor({ state: 'visible', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Detect whether we're still on the login screen (unauthenticated redirect). */
export async function isOnLogin(page: Page): Promise<boolean> {
  return (await page.locator('#signin-email').count()) > 0;
}

export async function expectAuthenticated(page: Page) {
  expect(await isOnLogin(page)).toBe(false);
}
