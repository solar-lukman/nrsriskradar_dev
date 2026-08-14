import { test, expect, type Page } from '@playwright/test';
import { usersWithCreds, type TestUser } from '../fixtures/users';
import { login, logout, isAccessDenied, isOnLogin } from '../fixtures/auth';
import {
  ROUTE_ACCESS,
  canSeeInSidebar,
  canPerformAction,
  type UserRole,
} from '../../src/lib/permissions';

/**
 * Role-permutation smoke suite.
 *
 * One fast pass per role that validates the three surfaces which must always
 * agree with `src/lib/permissions.ts`:
 *   1. route access   — every allowed route opens, every forbidden route is blocked
 *   2. sidebar        — a nav link exists exactly when `canSeeInSidebar` says so
 *   3. CTA visibility — gated buttons appear exactly when `canPerformAction` says so
 *
 * Deliberately shallow: it never fills a form or mutates data, so the whole
 * matrix runs in a couple of minutes and is safe against any environment.
 * Deep behaviour lives in the per-journey specs.
 *
 * Run only this suite:  npm run test:e2e:smoke
 */

const users = usersWithCreds();

/** Concrete (non-parameterised, non-hidden) routes, in permission order. */
const SIDEBAR_ROUTES = ROUTE_ACCESS
  .filter((r) => !r.hiddenFromSidebar && !r.path.includes(':'))
  .map((r) => r.path);

/** Page-scoped CTA probes: action id -> where it lives and how it reads. */
interface CtaProbe {
  action: string;
  path: string;
  /** Accessible name of the button that must be present/absent. */
  name: RegExp;
}

const CTA_PROBES: CtaProbe[] = [
  { action: 'risk.create', path: '/risk-register', name: /add (new )?risk|new risk|risk wizard/i },
  { action: 'bcp.create', path: '/business-continuity', name: /add (new )?(bcp|plan)|new plan/i },
  { action: 'kri.manage', path: '/kris', name: /new indicator/i },
  { action: 'incident.create', path: '/incidents', name: /report incident|add incident|new incident/i },
  { action: 'boardreport.generate', path: '/board-reports', name: /^generate$|generate reports?/i },
  { action: 'user.manage', path: '/user-management', name: /invite user|add user|new user/i },
];

/** Navigate and settle without waiting on long-poll network idle. */
async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
}

async function reachable(page: Page, path: string): Promise<boolean> {
  await visit(page, path);
  if (await isOnLogin(page)) return false;
  if (await isAccessDenied(page)) return false;
  return new URL(page.url()).pathname === path;
}

test.describe('Role-permutation smoke matrix', () => {
  test.skip(users.length === 0, 'No E2E user credentials configured');

  for (const user of users) {
    test.describe(`[${user.role}]`, () => {
      test(`${user.role} route access matches the permission matrix`, async ({ page }, testInfo) => {
        testInfo.annotations.push({ type: 'uat', description: 'UAT-SMOKE-extra-routes' });
        testInfo.annotations.push({ type: 'role', description: user.role });
        test.setTimeout(180_000);
        await login(page, user);

        // Landing page after sign-in.
        await visit(page, '/');
        expect
          .soft(new URL(page.url()).pathname, `${user.role} should land on ${user.landing}`)
          .toBe(user.landing);

        for (const path of SIDEBAR_ROUTES) {
          const allowed = user.allowedPaths.includes(path);
          const ok = await reachable(page, path);
          expect
            .soft(ok, `${user.role} ${allowed ? 'must reach' : 'must NOT reach'} ${path}`)
            .toBe(allowed);
        }

        await logout(page);
      });

      test(`${user.role} sidebar links match canSeeInSidebar()`, async ({ page }, testInfo) => {
        testInfo.annotations.push({ type: 'uat', description: 'UAT-SMOKE-extra-sidebar' });
        testInfo.annotations.push({ type: 'role', description: user.role });
        await login(page, user);
        await visit(page, user.landing);
        expect(await isOnLogin(page), `${user.role} failed to sign in`).toBe(false);

        for (const path of SIDEBAR_ROUTES) {
          const expected = canSeeInSidebar(user.role as UserRole, path);
          const count = await page.locator(`a[href="${path}"]`).count();
          expect
            .soft(
              count > 0,
              `${user.role} sidebar should ${expected ? 'show' : 'hide'} a link to ${path}`,
            )
            .toBe(expected);
        }

        await logout(page);
      });

      test(`${user.role} gated CTAs match canPerformAction()`, async ({ page }, testInfo) => {
        testInfo.annotations.push({ type: 'uat', description: 'UAT-SMOKE-extra-cta' });
        testInfo.annotations.push({ type: 'role', description: user.role });
        test.setTimeout(120_000);
        await login(page, user);

        for (const probe of CTA_PROBES) {
          // A CTA can only be judged on a page the role can actually open.
          if (!(await reachable(page, probe.path))) continue;

          const expected = canPerformAction(user.role as UserRole, probe.action);
          const count = await page.getByRole('button', { name: probe.name }).count()
            + await page.getByRole('link', { name: probe.name }).count();
          expect
            .soft(
              count > 0,
              `${user.role}: "${probe.action}" CTA on ${probe.path} should be ${expected ? 'visible' : 'hidden'}`,
            )
            .toBe(expected);
        }

        await logout(page);
      });
    });
  }
});

/** Guard: the fixtures must cover every role that has credentials wired up. */
test('smoke matrix covers the configured roles', async ({}, testInfo) => {
  testInfo.annotations.push({ type: 'uat', description: 'UAT-SMOKE-extra-coverage' });
  const roles = users.map((u: TestUser) => u.role);
  expect(new Set(roles).size, 'each configured role must appear once').toBe(roles.length);
});
