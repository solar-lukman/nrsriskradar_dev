/**
 * Per-case test data registry.
 *
 * Maps every UAT case ID in docs/uat-test-plan.md (plus the extra security
 * checks) to the fixtures it needs, and each fixture to the factory that
 * provisions it and the Section 8 area it satisfies. Seeding a single case
 * therefore provisions exactly — and only — the data that case requires.
 */
import {
  seedAppetite,
  seedBCPs,
  seedCategories,
  seedDepartments,
  seedGovernanceDecisions,
  seedIncidents,
  seedKRIReadings,
  seedKRIs,
  seedMitigationTasks,
  seedObjectives,
  seedRisks,
  seedScheduledBCPTest,
  seedSecurityProbeRows,
  seedWhistleblowCases,
  type SeedContext,
} from './factories';
import { ALL_ROLES } from '../../src/lib/permissions';

export type FixtureKey =
  | 'accounts'
  | 'lookups.departments'
  | 'lookups.categories'
  | 'lookups.objectives'
  | 'risks.lifecycle'
  | 'treatment.tasks'
  | 'appetite.rows'
  | 'kri.pair'
  | 'kri.readings'
  | 'governance.decisions'
  | 'bcp.plans'
  | 'bcp.scheduledTest'
  | 'incidents.owned'
  | 'whistleblow.cases'
  | 'security.probeRows';

export interface FixtureDefinition {
  key: FixtureKey;
  /** Section 8 area of docs/uat-test-plan.md this fixture satisfies. */
  section8: string;
  description: string;
  /** Fixtures that must be provisioned first. */
  requires?: FixtureKey[];
  provision: (ctx: SeedContext) => Promise<void>;
}

const noop = async () => {};

export const FIXTURES: Record<FixtureKey, FixtureDefinition> = {
  accounts: {
    key: 'accounts',
    section8: 'Accounts',
    description: 'One credentialed account per role (verified from e2e/.env, never created here).',
    provision: noop,
  },
  'lookups.departments': {
    key: 'lookups.departments',
    section8: 'Lookups',
    description: '≥ 3 named departments.',
    provision: seedDepartments,
  },
  'lookups.categories': {
    key: 'lookups.categories',
    section8: 'Lookups',
    description: '≥ 5 risk categories in the lookup table (enum stays in sync via trigger).',
    provision: seedCategories,
  },
  'lookups.objectives': {
    key: 'lookups.objectives',
    section8: 'Lookups',
    description: '≥ 3 strategic objectives for risk alignment.',
    provision: seedObjectives,
  },
  'risks.lifecycle': {
    key: 'risks.lifecycle',
    section8: 'Risks / Governance',
    description:
      '10 risks spanning Draft, Submitted, Under Review, Approved, Escalated, Mitigated, Crystallized; two with residual score ≥ 15.',
    requires: ['lookups.categories', 'lookups.departments'],
    provision: seedRisks,
  },
  'treatment.tasks': {
    key: 'treatment.tasks',
    section8: 'Treatment',
    description: '3 mitigation tasks (on-track, overdue, > 90% NGN budget utilisation).',
    requires: ['risks.lifecycle'],
    provision: seedMitigationTasks,
  },
  'appetite.rows': {
    key: 'appetite.rows',
    section8: 'Appetite',
    description: 'Tolerant appetite row and a low-tolerance row with threshold 12.',
    requires: ['lookups.categories'],
    provision: seedAppetite,
  },
  'kri.pair': {
    key: 'kri.pair',
    section8: 'KRIs',
    description:
      'Two indicators — one "higher is worse" (overdue next-due date, linked to a risk) and one "lower is worse".',
    requires: ['risks.lifecycle'],
    provision: seedKRIs,
  },
  'kri.readings': {
    key: 'kri.readings',
    section8: 'KRIs',
    description: 'Three readings per indicator producing Normal → Warning → Critical trends.',
    requires: ['kri.pair'],
    provision: seedKRIReadings,
  },
  'governance.decisions': {
    key: 'governance.decisions',
    section8: 'Governance',
    description: 'One recorded ERMSC decision on the Escalated risk with minute reference ERMSC/UAT/001.',
    requires: ['risks.lifecycle'],
    provision: seedGovernanceDecisions,
  },
  'bcp.plans': {
    key: 'bcp.plans',
    section8: 'BCP',
    description: 'Three plans covering Ready / Needs Review / Outdated, with BIA data on two of them.',
    requires: ['lookups.departments'],
    provision: seedBCPs,
  },
  'bcp.scheduledTest': {
    key: 'bcp.scheduledTest',
    section8: 'BCP',
    description: 'A future scheduled test on the Ready plan (reminder + calendar coverage).',
    requires: ['bcp.plans'],
    provision: seedScheduledBCPTest,
  },
  'incidents.owned': {
    key: 'incidents.owned',
    section8: 'Incidents',
    description: 'Two crystallised risk events with owners assigned (one open, one resolved).',
    requires: ['risks.lifecycle'],
    provision: seedIncidents,
  },
  'whistleblow.cases': {
    key: 'whistleblow.cases',
    section8: 'Whistleblowing',
    description: 'Two anonymous cases: one fresh, one > 14 days unassigned for the SLA flag.',
    provision: seedWhistleblowCases,
  },
  'security.probeRows': {
    key: 'security.probeRows',
    section8: 'Security checks',
    description:
      'At least one readable row in every table probed by the RLS matrix (audit logs, approval history, BCP version history, whistleblow messages) so an "allow" expectation cannot be masked by an empty table.',
    requires: ['risks.lifecycle', 'bcp.plans', 'whistleblow.cases', 'kri.readings', 'governance.decisions'],
    provision: seedSecurityProbeRows,
  },
};

const LOOKUPS: FixtureKey[] = ['lookups.categories', 'lookups.departments', 'lookups.objectives'];

/** Case ID → fixtures. Every plan case ID must appear here. */
export const CASE_FIXTURES: Record<string, FixtureKey[]> = {
  // 5.1 Authentication & access control
  'UAT-AUTH-01': ['accounts'],
  'UAT-AUTH-02': ['accounts'],
  'UAT-AUTH-03': ['accounts'],
  'UAT-AUTH-04': ['accounts'],
  'UAT-AUTH-05': ['accounts'],
  'UAT-AUTH-06': ['accounts'],
  'UAT-AUTH-07': ['accounts'],

  // 5.2 Risk register
  'UAT-REG-01': ['accounts', ...LOOKUPS],
  'UAT-REG-02': ['accounts', ...LOOKUPS, 'risks.lifecycle'],
  'UAT-REG-03': ['accounts', ...LOOKUPS],
  'UAT-REG-04': ['accounts', 'lookups.categories'],
  'UAT-REG-05': ['accounts', 'risks.lifecycle'],
  'UAT-REG-06': ['accounts', 'risks.lifecycle'],
  'UAT-REG-07': ['accounts', 'risks.lifecycle'],
  'UAT-REG-08': ['accounts', 'risks.lifecycle'],

  // 5.3 Approvals
  'UAT-APP-01': ['accounts', 'risks.lifecycle'],
  'UAT-APP-02': ['accounts', 'risks.lifecycle'],
  'UAT-APP-03': ['accounts', 'risks.lifecycle'],
  'UAT-APP-04': ['accounts', 'risks.lifecycle'],
  'UAT-APP-05': ['accounts', 'risks.lifecycle'],
  'UAT-APP-06': ['accounts', 'risks.lifecycle'],
  'UAT-APP-07': ['accounts', 'risks.lifecycle'],

  // 5.4 Treatment
  'UAT-TRT-01': ['accounts', 'risks.lifecycle'],
  'UAT-TRT-02': ['accounts', 'risks.lifecycle', 'treatment.tasks'],
  'UAT-TRT-03': ['accounts', 'risks.lifecycle', 'treatment.tasks'],
  'UAT-TRT-04': ['accounts', 'risks.lifecycle', 'treatment.tasks'],

  // 5.5 Dashboards
  'UAT-DSH-01': ['accounts', 'risks.lifecycle', 'bcp.plans', 'incidents.owned'],
  'UAT-DSH-02': ['accounts', 'risks.lifecycle'],
  'UAT-DSH-03': ['accounts', 'risks.lifecycle'],
  'UAT-DSH-04': ['accounts', 'risks.lifecycle'],
  'UAT-DSH-05': ['accounts', 'risks.lifecycle', 'bcp.plans'],
  'UAT-DSH-06': ['accounts', 'risks.lifecycle', 'incidents.owned'],

  // 5.6 Business continuity
  'UAT-BCP-01': ['accounts', 'lookups.departments'],
  'UAT-BCP-02': ['accounts', 'bcp.plans'],
  'UAT-BCP-03': ['accounts', 'bcp.plans', 'bcp.scheduledTest'],
  'UAT-BCP-04': ['accounts', 'bcp.plans', 'bcp.scheduledTest'],
  'UAT-BCP-05': ['accounts', 'bcp.plans'],

  // 5.7 Incidents
  'UAT-INC-01': ['accounts', 'risks.lifecycle', 'incidents.owned'],
  'UAT-INC-02': ['accounts', 'incidents.owned'],

  // 5.8 Audit
  'UAT-AUD-01': ['accounts', 'risks.lifecycle', 'security.probeRows'],
  'UAT-AUD-02': ['accounts', 'risks.lifecycle', 'security.probeRows'],
  'UAT-AUD-03': ['accounts', 'security.probeRows'],

  // 5.9 Whistleblowing
  'UAT-WB-01': ['whistleblow.cases'],
  'UAT-WB-02': ['whistleblow.cases'],
  'UAT-WB-03': ['accounts', 'whistleblow.cases'],
  'UAT-WB-04': ['accounts', 'whistleblow.cases'],

  // 5.10 Notifications
  'UAT-NTF-01': ['accounts', 'risks.lifecycle'],
  'UAT-NTF-02': ['accounts'],
  'UAT-NTF-03': ['accounts', 'risks.lifecycle'],

  // 5.11 Settings
  'UAT-SET-01': ['accounts', 'lookups.categories'],
  'UAT-SET-02': ['accounts', 'appetite.rows'],
  'UAT-SET-03': ['accounts', ...LOOKUPS],

  // 5.12 KRIs
  'UAT-KRI-01': ['accounts', 'risks.lifecycle'],
  'UAT-KRI-02': ['accounts', 'kri.pair'],
  'UAT-KRI-03': ['accounts', 'kri.pair', 'kri.readings'],
  'UAT-KRI-04': ['accounts', 'kri.pair', 'kri.readings'],
  'UAT-KRI-05': ['accounts', 'kri.pair', 'kri.readings'],
  'UAT-KRI-06': ['accounts', 'kri.pair', 'kri.readings'],
  'UAT-KRI-07': ['accounts', 'kri.pair', 'kri.readings'],
  'UAT-KRI-08': ['accounts', 'kri.pair'],
  'UAT-KRI-09': ['accounts', 'kri.pair', 'risks.lifecycle'],

  // 5.13 Governance decisions
  'UAT-GOV-01': ['accounts', 'risks.lifecycle'],
  'UAT-GOV-02': ['accounts', 'risks.lifecycle', 'governance.decisions'],
  'UAT-GOV-03': ['accounts', 'risks.lifecycle', 'governance.decisions'],
  'UAT-GOV-04': ['accounts', 'risks.lifecycle', 'governance.decisions'],
  'UAT-GOV-05': ['accounts', 'risks.lifecycle', 'governance.decisions'],
  'UAT-GOV-06': ['accounts', 'risks.lifecycle', 'governance.decisions'],
  'UAT-GOV-07': ['accounts', 'risks.lifecycle', 'governance.decisions'],

  // 5.14 Risk appetite
  'UAT-RAP-01': ['accounts', 'appetite.rows', 'risks.lifecycle'],
  'UAT-RAP-02': ['accounts', 'appetite.rows', 'risks.lifecycle'],
  'UAT-RAP-03': ['accounts', 'appetite.rows', 'risks.lifecycle'],
  'UAT-RAP-04': ['accounts', 'appetite.rows', 'risks.lifecycle'],
  'UAT-RAP-05': ['accounts', 'appetite.rows', 'risks.lifecycle'],

  // Extra security checks (no plan case ID) — RLS matrix and negative probes.
  'UAT-RLS-MATRIX': ['accounts', 'security.probeRows'],
  'UAT-DATA-neg': ['accounts', 'risks.lifecycle', 'security.probeRows'],
};

export const ALL_CASE_IDS = Object.keys(CASE_FIXTURES);

/** Expand a fixture list to include its transitive requirements, in run order. */
export function resolveFixtures(keys: FixtureKey[]): FixtureKey[] {
  const ordered: FixtureKey[] = [];
  const visit = (key: FixtureKey, trail: FixtureKey[] = []) => {
    if (ordered.includes(key)) return;
    if (trail.includes(key)) throw new Error(`Circular fixture dependency: ${[...trail, key].join(' → ')}`);
    for (const dep of FIXTURES[key].requires || []) visit(dep, [...trail, key]);
    ordered.push(key);
  };
  keys.forEach((k) => visit(k));
  return ordered;
}

/** Fixtures required by a set of case IDs (transitively resolved, de-duplicated). */
export function fixturesForCases(caseIds: string[]): FixtureKey[] {
  const requested: FixtureKey[] = [];
  for (const id of caseIds) {
    const fixtures = CASE_FIXTURES[id];
    if (!fixtures) throw new Error(`Unknown case ID: ${id}`);
    fixtures.forEach((f) => requested.includes(f) || requested.push(f));
  }
  return resolveFixtures(requested);
}

/** Roles that must have credentials for the `accounts` fixture to be satisfied. */
export const REQUIRED_ACCOUNT_ROLES = ALL_ROLES;
