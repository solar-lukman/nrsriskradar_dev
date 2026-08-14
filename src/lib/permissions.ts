/**
 * Single source of truth for the RiskRadar role-permission matrix.
 *
 * Everything that gates behaviour by role reads from this file:
 *  - `src/contexts/AuthContext.tsx`      -> `hasPermission()`
 *  - `src/components/Sidebar.tsx`        -> nav visibility (via permission strings)
 *  - `src/lib/navAccessConsistency.ts`   -> sidebar <-> route-guard consistency
 *  - `e2e/fixtures/users.ts`             -> Playwright allowed/forbidden paths
 *  - `src/test/permissionMatrix.test.ts` -> the frozen truth table
 *
 * IMPORTANT: this module must stay free of React and Supabase imports so the
 * e2e (node) and unit (jsdom) runners can both import it cheaply.
 */

export type UserRole =
  | 'RC'         // Risk Champion
  | 'RR'         // Risk Reviewer
  | 'RO'         // Risk Owner
  | 'RMD'        // Risk Management Department
  | 'CRO'        // Chief Risk Officer
  | 'ERMSC'      // ERM Steering Committee
  | 'EC'         // Executive Chairman
  | 'RCB'        // Risk Committee of the Board
  | 'SUPERVISOR' // Supervisor (Compliance)
  | 'ADMIN'      // Admin
  | 'USER';      // General user

export const ALL_ROLES: UserRole[] = [
  'RC', 'RR', 'RO', 'RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'SUPERVISOR', 'ADMIN', 'USER',
];

/** Role -> permission strings. `*` is the ADMIN wildcard. */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
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

/** Does `role` hold `permission`? ADMIN's `*` satisfies everything. */
export function roleHas(role: UserRole | undefined | null, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface RouteAccess {
  path: string;
  /** Permission string the sidebar entry / page gate checks. */
  permission: string;
  /** Roles admitted regardless of `permission` (e.g. RMD/CRO on audit logs). */
  extraRoles?: UserRole[];
  /** Roles the page guard admits beyond `permission` (legacy widenings). */
  extraGuardRoles?: UserRole[];
  /** True when the route has no sidebar entry (deep-link / detail pages). */
  hiddenFromSidebar?: boolean;
  /** Authenticated session only, no role gate (profile, detail pages). */
  authOnly?: boolean;
}

/**
 * Every authenticated route in `src/App.tsx`, with its access rule.
 * `src/test/permissionMatrix.test.ts` asserts this list matches App.tsx.
 */
export const ROUTE_ACCESS: RouteAccess[] = [
  { path: '/app', permission: 'view_dashboard' },
  { path: '/risk-register', permission: 'view_risks', extraGuardRoles: ['RC', 'RR', 'RO', 'RMD', 'ADMIN'] },
  { path: '/approvals', permission: 'use_approval_inbox' },
  { path: '/risk-matrix', permission: 'view_reports', extraGuardRoles: ['RC', 'RO', 'USER'] },
  { path: '/business-continuity', permission: 'manage_continuity', extraGuardRoles: ['RMD', 'CRO', 'ADMIN'] },
  { path: '/business-continuity/new', permission: 'manage_continuity', extraGuardRoles: ['RMD', 'CRO', 'ADMIN'], hiddenFromSidebar: true },
  { path: '/business-continuity/:id/edit', permission: 'manage_continuity', extraGuardRoles: ['RMD', 'CRO', 'ADMIN'], hiddenFromSidebar: true },
  { path: '/reports', permission: 'view_reports' },
  { path: '/incidents', permission: 'view_risks' },
  { path: '/learning-forum', permission: 'view_risks' },
  { path: '/calendar', permission: 'view_dashboard' },
  { path: '/help', permission: 'view_dashboard' },
  { path: '/executive-summary', permission: 'strategic_overview' },
  { path: '/board-reports', permission: 'board_oversight' },
  { path: '/whistleblow/cases', permission: 'manage_whistleblow' },
  { path: '/user-management', permission: 'manage_users' },
  { path: '/settings', permission: '*' },
  { path: '/data-management', permission: '*' },
  { path: '/audit-logs', permission: '*', extraRoles: ['RMD', 'CRO'] },
  { path: '/bcp-schema-checks', permission: '*', extraRoles: ['RMD', 'CRO'] },
  // Deep-link / detail routes: authenticated session only, data gated by RLS.
  { path: '/risk-assessment/:id', permission: 'view_risks', hiddenFromSidebar: true },
  { path: '/whistleblow/cases/:id', permission: 'manage_whistleblow', hiddenFromSidebar: true },
  { path: '/control-documents', permission: 'view_risks', hiddenFromSidebar: true },
  { path: '/profile', permission: 'view_dashboard', hiddenFromSidebar: true, authOnly: true },
  { path: '/admin/auth-verification', permission: '*', hiddenFromSidebar: true },
];

/** Should this role see the sidebar entry for `path`? */
export function canSeeInSidebar(role: UserRole, path: string): boolean {
  const route = ROUTE_ACCESS.find((r) => r.path === path);
  if (!route || route.hiddenFromSidebar) return false;
  return roleHas(role, route.permission) || !!route.extraRoles?.includes(role);
}

/** Should the page guard admit this role at `path`? */
export function canAccessRoute(role: UserRole, path: string): boolean {
  const route = ROUTE_ACCESS.find((r) => r.path === path);
  if (!route) return false;
  if (route.authOnly) return true;
  return (
    roleHas(role, route.permission) ||
    !!route.extraRoles?.includes(role) ||
    !!route.extraGuardRoles?.includes(role)
  );
}

/** Sidebar-visible routes for a role, in declaration order. */
export function visibleRoutesFor(role: UserRole): string[] {
  return ROUTE_ACCESS.filter((r) => !r.hiddenFromSidebar && canSeeInSidebar(role, r.path)).map((r) => r.path);
}

/** Routes a role must be denied (used to build e2e forbidden paths). */
export function forbiddenRoutesFor(role: UserRole): string[] {
  return ROUTE_ACCESS.filter((r) => !r.hiddenFromSidebar && !canAccessRoute(role, r.path)).map((r) => r.path);
}

// ---------------------------------------------------------------------------
// Actions (button-grain gating)
// ---------------------------------------------------------------------------

/**
 * Every mutating UI control that is gated by role.
 *
 * `serverCounterpart` names the policy, trigger or SECURITY DEFINER routine
 * that refuses the same request when the button is bypassed (ADR-0009). An
 * action without one fails `src/test/permissionMatrix.test.ts`.
 */
export interface ActionAccess {
  id: string;
  label: string;
  permission: string;
  /** Roles allowed beyond `permission`. */
  extraRoles?: UserRole[];
  /** Roles explicitly denied even if they hold `permission`. */
  deniedRoles?: UserRole[];
  serverCounterpart: string;
}

export const ACTION_ACCESS: ActionAccess[] = [
  { id: 'risk.create', label: 'Add New Risk', permission: 'add_risk', serverCounterpart: 'RLS: risks_insert_policy' },
  { id: 'risk.edit_any', label: 'Edit any risk', permission: 'edit_risks', serverCounterpart: 'RLS: risks_update_policy' },
  { id: 'risk.edit_own', label: 'Edit own risk', permission: 'edit_own_risks', extraRoles: ['RMD', 'CRO', 'ADMIN'], serverCounterpart: 'RLS: risks_update_policy (created_by = auth.uid())' },
  { id: 'risk.delete', label: 'Delete risk', permission: '*', extraRoles: ['RMD'], serverCounterpart: 'RLS: risks_delete_policy' },
  { id: 'risk.submit', label: 'Submit for approval', permission: 'add_risk', serverCounterpart: 'RPC: apply_workflow_transition' },
  { id: 'risk.claim', label: 'Claim for review', permission: 'use_approval_inbox', serverCounterpart: 'RPC: apply_workflow_transition' },
  { id: 'risk.approve', label: 'Approve risk', permission: 'approve_risks', extraRoles: ['CRO', 'RMD', 'ADMIN'], serverCounterpart: 'RPC: apply_workflow_transition' },
  { id: 'risk.reject', label: 'Reject risk', permission: 'approve_risks', extraRoles: ['CRO', 'RMD', 'ADMIN'], serverCounterpart: 'RPC: apply_workflow_transition' },
  { id: 'risk.bulk_approve', label: 'Bulk approve', permission: 'approve_all', extraRoles: ['ADMIN'], serverCounterpart: 'RPC: apply_workflow_transition (per row)' },
  { id: 'risk.assign', label: 'Assign risk owner', permission: 'assign_risks', extraRoles: ['RMD', 'CRO', 'ADMIN'], serverCounterpart: 'RLS: risks_update_policy' },
  { id: 'bcp.create', label: 'Add BCP', permission: 'manage_continuity', serverCounterpart: 'RLS: business_continuity_plans_insert_policy' },
  { id: 'bcp.edit', label: 'Edit BCP', permission: 'manage_continuity', serverCounterpart: 'RLS + trigger validate_bcp_bia_test_fields()' },
  { id: 'incident.create', label: 'Report incident', permission: 'view_risks', serverCounterpart: 'RLS: risk_events_insert_policy' },
  { id: 'incident.assign', label: 'Assign investigator', permission: 'edit_risks', extraRoles: ['SUPERVISOR', 'ADMIN'], serverCounterpart: 'RLS: risk_events_update_policy' },
  { id: 'whistleblow.triage', label: 'Triage case', permission: 'manage_whistleblow', serverCounterpart: 'RLS: whistleblow_cases_update_policy' },
  { id: 'boardreport.generate', label: 'Generate board report', permission: 'board_oversight', extraRoles: ['RMD', 'CRO', 'ADMIN'], serverCounterpart: 'Edge function: ai-report-generator (JWT + role check)' },
  { id: 'user.manage', label: 'Manage users', permission: 'manage_users', deniedRoles: ['CRO'], serverCounterpart: 'Edge function: admin-invite-user (JWT + has_role ADMIN/RMD)' },
  { id: 'user.set_role', label: 'Change user role', permission: '*', serverCounterpart: 'RLS: user_roles admin-only + trigger log_user_role_change()' },
  { id: 'settings.manage', label: 'System settings', permission: '*', serverCounterpart: 'RLS: admin-only policies on config tables' },
  { id: 'sampledata.manage', label: 'Sample data', permission: '*', serverCounterpart: 'Edge function: sample-data-manager (JWT + ADMIN)' },
];

/** May this role perform the gated action? */
export function canPerformAction(role: UserRole, actionId: string): boolean {
  const action = ACTION_ACCESS.find((a) => a.id === actionId);
  if (!action) return false;
  if (action.deniedRoles?.includes(role)) return false;
  return roleHas(role, action.permission) || !!action.extraRoles?.includes(role);
}

/** Full grid: role -> action id -> allowed. Used by the frozen truth table. */
export function buildActionMatrix(): Record<UserRole, Record<string, boolean>> {
  const out = {} as Record<UserRole, Record<string, boolean>>;
  for (const role of ALL_ROLES) {
    out[role] = {};
    for (const action of ACTION_ACCESS) {
      out[role][action.id] = canPerformAction(role, action.id);
    }
  }
  return out;
}

/** Full grid: role -> route path -> { sidebar, guard }. */
export function buildRouteMatrix(): Record<UserRole, Record<string, { sidebar: boolean; guard: boolean }>> {
  const out = {} as Record<UserRole, Record<string, { sidebar: boolean; guard: boolean }>>;
  for (const role of ALL_ROLES) {
    out[role] = {};
    for (const route of ROUTE_ACCESS) {
      out[role][route.path] = {
        sidebar: canSeeInSidebar(role, route.path),
        guard: canAccessRoute(role, route.path),
      };
    }
  }
  return out;
}
