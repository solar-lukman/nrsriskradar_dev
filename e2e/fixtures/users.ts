import type { UserRole } from '../../src/contexts/AuthContext';

export interface TestUser {
  role: UserRole;
  email: string;
  password: string;
  /** Path the user is expected to land on after login (LandingPage roleHome logic). */
  landing: string;
  /** Sidebar paths this role must be able to open (200 / no Access Denied). */
  allowedPaths: string[];
  /** Sidebar/deep-link paths this role must NOT be able to open. */
  forbiddenPaths: string[];
}

/**
 * Read credentials from environment. Never hardcode passwords.
 * Set them in e2e/.env (git-ignored) or CI secrets. See e2e/.env.example.
 */
function envUser(role: UserRole, landing: string, allowed: string[], forbidden: string[]): TestUser {
  const key = role.toUpperCase();
  return {
    role,
    email: process.env[`E2E_${key}_EMAIL`] || '',
    password: process.env[`E2E_${key}_PASSWORD`] || '',
    landing,
    allowedPaths: allowed,
    forbiddenPaths: forbidden,
  };
}

// Route → permission mapping mirrors src/lib/navAccessConsistency.ts and the
// role permissions in src/contexts/AuthContext.tsx. Keep in sync.
export const USERS: TestUser[] = [
  envUser('ADMIN', '/app',
    ['/app', '/risk-register', '/risk-matrix', '/business-continuity', '/reports',
     '/incidents', '/user-management', '/data-management', '/settings',
     '/board-reports', '/executive-summary', '/whistleblow/cases', '/approvals'],
    []),
  envUser('RMD', '/app',
    ['/app', '/risk-register', '/risk-matrix', '/business-continuity', '/reports',
     '/incidents', '/user-management', '/approvals', '/whistleblow/cases'],
    ['/settings', '/data-management']),
  envUser('CRO', '/app',
    ['/app', '/risk-register', '/risk-matrix', '/business-continuity', '/reports',
     '/incidents', '/approvals', '/whistleblow/cases'],
    ['/user-management', '/settings', '/data-management']),
  envUser('RC', '/risk-register',
    ['/app', '/risk-register'],
    ['/user-management', '/settings', '/data-management', '/board-reports', '/executive-summary', '/approvals']),
  envUser('RR', '/risk-register',
    ['/app', '/risk-register', '/approvals', '/reports'],
    ['/user-management', '/settings', '/data-management']),
  envUser('RO', '/risk-register',
    ['/app', '/risk-register'],
    ['/user-management', '/settings', '/data-management', '/approvals']),
  envUser('EC', '/executive-summary',
    ['/executive-summary', '/reports', '/app'],
    ['/user-management', '/settings', '/data-management', '/approvals']),
  envUser('ERMSC', '/executive-summary',
    ['/executive-summary', '/reports', '/app'],
    ['/user-management', '/settings', '/data-management', '/approvals']),
  envUser('RCB', '/executive-summary',
    ['/executive-summary', '/reports', '/app', '/board-reports'],
    ['/user-management', '/settings', '/data-management', '/approvals']),
  envUser('SUPERVISOR', '/whistleblow/cases',
    ['/whistleblow/cases', '/approvals', '/reports', '/app'],
    ['/user-management', '/settings', '/data-management']),
];

export function usersWithCreds(): TestUser[] {
  return USERS.filter((u) => u.email && u.password);
}
