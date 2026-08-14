/**
 * Automated consistency checks: each role's sidebar navigation must match
 * the route-guard permissions for the corresponding page.
 *
 * The rules themselves live in `src/lib/permissions.ts` (single source of
 * truth). This module only *compares* the two derived views and reports drift.
 *
 * Run in dev via `runNavAccessConsistencyCheck()` (wired in `main.tsx`).
 */

import {
  ALL_ROLES,
  ROUTE_ACCESS,
  canAccessRoute,
  canSeeInSidebar,
  roleHas,
  type UserRole,
} from '@/lib/permissions';

export interface NavAccessMismatch {
  role: UserRole;
  path: string;
  sidebarVisible: boolean;
  guardAllows: boolean;
  reason: string;
}

export function findNavAccessMismatches(): NavAccessMismatch[] {
  const mismatches: NavAccessMismatch[] = [];
  for (const role of ALL_ROLES) {
    for (const route of ROUTE_ACCESS) {
      if (route.hiddenFromSidebar) continue;
      const sidebarVisible = canSeeInSidebar(role, route.path);
      const guardAllows = canAccessRoute(role, route.path);
      if (sidebarVisible !== guardAllows) {
        mismatches.push({
          role,
          path: route.path,
          sidebarVisible,
          guardAllows,
          reason: sidebarVisible
            ? 'Sidebar shows link but route guard denies access'
            : 'Route guard allows access but sidebar hides the link',
        });
      }
    }
  }
  return mismatches;
}

/** Hard invariants — explicit examples, including the CRO/user-management rule. */
export function findInvariantViolations(): string[] {
  const violations: string[] = [];
  const expect = (cond: boolean, msg: string) => { if (!cond) violations.push(msg); };

  // CRO must NOT have user-management access (sidebar or route)
  expect(!roleHas('CRO', 'manage_users'), 'CRO must not have manage_users permission');
  expect(!canSeeInSidebar('CRO', '/user-management'), 'CRO must not see /user-management in sidebar');
  expect(!canAccessRoute('CRO', '/user-management'), 'CRO route guard must deny /user-management');

  // ADMIN must access everything
  for (const route of ROUTE_ACCESS) {
    if (route.hiddenFromSidebar) continue;
    expect(canSeeInSidebar('ADMIN', route.path), `ADMIN should see ${route.path} in sidebar`);
    expect(canAccessRoute('ADMIN', route.path), `ADMIN should be allowed by ${route.path} route guard`);
  }

  // Read-only roles must never reach admin surfaces
  for (const role of ['EC', 'ERMSC', 'RCB', 'USER'] as UserRole[]) {
    for (const path of ['/user-management', '/settings', '/data-management']) {
      expect(!canAccessRoute(role, path), `${role} must not reach ${path}`);
    }
  }

  return violations;
}

export function runNavAccessConsistencyCheck(): void {
  const mismatches = findNavAccessMismatches();
  const violations = findInvariantViolations();

  if (mismatches.length === 0 && violations.length === 0) {
    console.info('[nav-access-check] ✅ Sidebar ↔ route-guard permissions consistent across all roles');
    return;
  }

  if (mismatches.length > 0) {
    console.error('[nav-access-check] ❌ Sidebar/route mismatches:', mismatches);
  }
  if (violations.length > 0) {
    console.error('[nav-access-check] ❌ Invariant violations:', violations);
  }
}
