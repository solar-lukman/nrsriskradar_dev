import {
  ALL_ROLES,
  visibleRoutesFor,
  forbiddenRoutesFor,
  type UserRole,
} from '../../src/lib/permissions';

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
 * Landing pages mirror the roleHome logic in src/pages/LandingPage.tsx.
 * Everything else (allowed / forbidden routes) is derived from the single
 * permission matrix in src/lib/permissions.ts so the e2e suite can never
 * drift from the app's own rules.
 */
const LANDING: Record<UserRole, string> = {
  ADMIN: '/app',
  RMD: '/app',
  CRO: '/app',
  RC: '/risk-register',
  RR: '/risk-register',
  RO: '/risk-register',
  EC: '/executive-summary',
  ERMSC: '/executive-summary',
  RCB: '/executive-summary',
  SUPERVISOR: '/whistleblow/cases',
  USER: '/app',
};

/**
 * Read credentials from environment. Never hardcode passwords.
 * Set them in e2e/.env (git-ignored) or CI secrets. See e2e/.env.example.
 */
function envUser(role: UserRole): TestUser {
  const key = role.toUpperCase();
  return {
    role,
    email: process.env[`E2E_${key}_EMAIL`] || '',
    password: process.env[`E2E_${key}_PASSWORD`] || '',
    landing: LANDING[role],
    allowedPaths: visibleRoutesFor(role),
    forbiddenPaths: forbiddenRoutesFor(role),
  };
}

export const USERS: TestUser[] = ALL_ROLES.map(envUser);


export function usersWithCreds(): TestUser[] {
  return USERS.filter((u) => u.email && u.password);
}
