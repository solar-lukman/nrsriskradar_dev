/**
 * Automated consistency checks: each role's sidebar navigation must match
 * the route-guard permissions for the corresponding page.
 *
 * Run in dev via `runNavAccessConsistencyCheck()` (wired in `main.tsx`).
 * Any mismatch is logged as a console.error so regressions surface immediately.
 */

import type { UserRole } from '@/contexts/AuthContext';

// Single source of truth: role -> permissions (mirrors AuthContext.rolePermissions)
const rolePermissions: Record<UserRole, string[]> = {
  RC: ['view_risks', 'add_risk', 'edit_own_risks', 'view_dashboard'],
  RR: ['view_risks', 'review_risks', 'approve_risks', 'use_approval_inbox', 'view_dashboard', 'view_reports'],
  RO: ['view_risks', 'add_risk', 'edit_own_risks', 'view_dashboard', 'assign_risks'],
  RMD: ['view_risks', 'add_risk', 'edit_risks', 'use_approval_inbox', 'view_dashboard', 'manage_continuity', 'view_reports', 'manage_users', 'manage_whistleblow'],
  CRO: ['view_risks', 'add_risk', 'edit_risks', 'use_approval_inbox', 'view_dashboard', 'manage_continuity', 'view_reports', 'approve_all', 'manage_whistleblow'],
  ERMSC: ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview'],
  EC: ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview', 'executive_actions'],
  RCB: ['view_risks', 'view_dashboard', 'view_reports', 'strategic_overview', 'board_oversight'],
  SUPERVISOR: ['view_risks', 'view_dashboard', 'view_reports', 'use_approval_inbox', 'manage_whistleblow'],
  ADMIN: ['*'],
  USER: ['view_risks', 'view_dashboard'],
};

function roleHas(role: UserRole, perm: string): boolean {
  const perms = rolePermissions[role] || [];
  return perms.includes('*') || perms.includes(perm);
}

interface RouteSpec {
  path: string;
  // sidebar visibility rule (mirrors Sidebar.tsx)
  sidebar: (role: UserRole) => boolean;
  // route guard rule (mirrors the page component's gate)
  guard: (role: UserRole) => boolean;
}

const ROUTES: RouteSpec[] = [
  { path: '/app',                 sidebar: r => roleHas(r, 'view_dashboard'),     guard: r => roleHas(r, 'view_dashboard') },
  { path: '/risk-register',       sidebar: r => roleHas(r, 'view_risks'),         guard: r => roleHas(r, 'view_risks') || ['RC','RR','RO','RMD','ADMIN'].includes(r) },
  { path: '/approvals',           sidebar: r => roleHas(r, 'use_approval_inbox'), guard: r => roleHas(r, 'use_approval_inbox') },
  { path: '/risk-matrix',         sidebar: r => roleHas(r, 'view_reports'),       guard: r => roleHas(r, 'view_risks') },
  { path: '/business-continuity', sidebar: r => roleHas(r, 'manage_continuity'),  guard: r => roleHas(r, 'manage_continuity') || ['RMD','CRO','ADMIN'].includes(r) },
  { path: '/reports',             sidebar: r => roleHas(r, 'view_reports'),       guard: r => roleHas(r, 'view_reports') },
  { path: '/incidents',           sidebar: r => roleHas(r, 'view_risks'),         guard: r => roleHas(r, 'view_risks') },
  { path: '/learning-forum',      sidebar: r => roleHas(r, 'view_risks'),         guard: r => roleHas(r, 'view_risks') },
  { path: '/calendar',            sidebar: r => roleHas(r, 'view_dashboard'),     guard: r => roleHas(r, 'view_dashboard') },
  { path: '/help',                sidebar: r => roleHas(r, 'view_dashboard'),     guard: r => roleHas(r, 'view_dashboard') },
  { path: '/executive-summary',   sidebar: r => roleHas(r, 'strategic_overview'), guard: r => roleHas(r, 'strategic_overview') },
  { path: '/board-reports',       sidebar: r => roleHas(r, 'board_oversight'),    guard: r => roleHas(r, 'board_oversight') },
  { path: '/whistleblow/cases',   sidebar: r => roleHas(r, 'manage_whistleblow'), guard: r => roleHas(r, 'manage_whistleblow') },
  // Admin section - special: AuditLogs/BCP-checks visible to RMD & CRO too
  { path: '/user-management',     sidebar: r => roleHas(r, 'manage_users'),       guard: r => roleHas(r, 'manage_users') },
  { path: '/settings',            sidebar: r => roleHas(r, '*'),                  guard: r => roleHas(r, '*') },
  { path: '/data-management',     sidebar: r => roleHas(r, '*'),                  guard: r => roleHas(r, '*') },
  { path: '/audit-logs',          sidebar: r => roleHas(r, '*') || r === 'RMD' || r === 'CRO', guard: r => roleHas(r, '*') || r === 'RMD' || r === 'CRO' },
  { path: '/bcp-schema-checks',   sidebar: r => roleHas(r, '*') || r === 'RMD' || r === 'CRO', guard: r => roleHas(r, '*') || r === 'RMD' || r === 'CRO' },
];

const ALL_ROLES: UserRole[] = ['RC','RR','RO','RMD','CRO','ERMSC','EC','RCB','SUPERVISOR','ADMIN','USER'];

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
    for (const route of ROUTES) {
      const sidebarVisible = route.sidebar(role);
      const guardAllows = route.guard(role);
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
  const userMgmt = ROUTES.find(r => r.path === '/user-management')!;
  expect(!userMgmt.sidebar('CRO'), 'CRO must not see /user-management in sidebar');
  expect(!userMgmt.guard('CRO'),   'CRO route guard must deny /user-management');

  // ADMIN must access everything
  for (const route of ROUTES) {
    expect(route.sidebar('ADMIN'), `ADMIN should see ${route.path} in sidebar`);
    expect(route.guard('ADMIN'),   `ADMIN should be allowed by ${route.path} route guard`);
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
