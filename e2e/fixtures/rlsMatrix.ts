import type { UserRole } from '../../src/lib/permissions';

/**
 * Tier 3 — server-side RLS truth table.
 *
 * For each (table, role) pair we declare what the *database* must allow,
 * independent of what the UI shows. The spec in tests/rls-matrix.spec.ts
 * drives these through the Data API using each role's own JWT.
 *
 * Only SELECT and "write" (INSERT/UPDATE on a non-existent row) are probed:
 * writes are executed against ids that cannot exist, so a permitted write
 * still changes nothing while an RLS refusal is fully observable.
 */

export type Access = 'allow' | 'deny';

export interface TableExpectation {
  table: string;
  /** Roles whose SELECT must succeed. Everyone else must be denied. */
  readRoles: UserRole[] | 'all';
  /** Roles whose UPDATE must be permitted by policy. Everyone else denied. */
  writeRoles: UserRole[];
  /** Column patched during the write probe (must exist and be text). */
  writeColumn: string;
  /** Skip the write probe (append-only / trigger-guarded tables). */
  readOnly?: boolean;
}

const NEVER_MATCHES = 'id=eq.00000000-0000-0000-0000-000000000000';

export const IMPOSSIBLE_FILTER = NEVER_MATCHES;

export const RLS_MATRIX: TableExpectation[] = [
  {
    table: 'risks',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO', 'RC', 'RR', 'RO'],
    writeColumn: 'title',
  },
  {
    table: 'risk_events',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO', 'RC', 'RR', 'RO'],
    writeColumn: 'description',
  },
  {
    table: 'business_continuity_plans',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'title',
  },
  {
    table: 'risk_categories',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'name',
  },
  {
    table: 'departments',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'name',
  },
  {
    table: 'risk_appetite_config',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'description',
  },
  {
    // Roles are the crown jewels: only ADMIN may mutate them.
    table: 'user_roles',
    readRoles: 'all',
    writeRoles: ['ADMIN'],
    writeColumn: 'role',
  },
  {
    // Append-only audit trails — nobody may UPDATE.
    table: 'risk_audit_logs',
    readRoles: ['ADMIN', 'RMD', 'CRO'],
    writeRoles: [],
    writeColumn: 'action',
    readOnly: true,
  },
  {
    table: 'approval_history',
    readRoles: 'all',
    writeRoles: [],
    writeColumn: 'action',
    readOnly: true,
  },
  {
    table: 'bcp_version_history',
    readRoles: ['ADMIN', 'RMD', 'CRO'],
    writeRoles: [],
    writeColumn: 'action',
    readOnly: true,
  },
  {
    // Whistleblowing is deliberately narrow: supervisors + admins only.
    table: 'whistleblow_cases',
    readRoles: ['ADMIN', 'SUPERVISOR'],
    writeRoles: ['ADMIN', 'SUPERVISOR'],
    writeColumn: 'resolution_notes',
  },
  {
    table: 'whistleblow_messages',
    readRoles: ['ADMIN', 'SUPERVISOR'],
    writeRoles: [],
    writeColumn: 'message',
    readOnly: true,
  },
  {
    // KRIs: readable by everyone, maintained by the RMD mandate only.
    table: 'kris',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'name',
  },
  {
    table: 'kri_readings',
    readRoles: 'all',
    writeRoles: ['ADMIN', 'RMD', 'CRO'],
    writeColumn: 'note',
  },
  {
    // Committee decisions are amendable only by their author or an admin.
    table: 'risk_governance_decisions',
    readRoles: 'all',
    writeRoles: ['ADMIN'],
    writeColumn: 'rationale',
  },
];

export function expectedRead(t: TableExpectation, role: UserRole): Access {
  if (t.readRoles === 'all') return 'allow';
  return t.readRoles.includes(role) ? 'allow' : 'deny';
}

export function expectedWrite(t: TableExpectation, role: UserRole): Access {
  return t.writeRoles.includes(role) ? 'allow' : 'deny';
}
