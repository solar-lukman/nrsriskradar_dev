/**
 * Client-side mirror of the `derive_bcp_status()` database trigger.
 *
 * The database is the authority — this module only powers the read-only
 * preview shown in the wizard so users understand *why* a plan sits in a
 * given status before they save.
 */
export type BCPPlanStatus = 'Ready' | 'Needs Review' | 'Outdated';
export type BCPTestStatusValue = 'Not Tested' | 'Passed' | 'Failed' | 'Overdue';

/** Roles allowed to sign a plan off (also mirrored server-side). */
export const SIGNOFF_ROLES = ['RMD', 'CRO', 'ADMIN'];
/** Roles allowed to manually override the derived status. */
export const OVERRIDE_ROLES = ['ADMIN', 'CRO'];

export const canSignOffBcp = (role?: string | null) => !!role && SIGNOFF_ROLES.includes(role);
export const canOverrideBcpStatus = (role?: string | null) => !!role && OVERRIDE_ROLES.includes(role);

export interface BCPStatusInput {
  biaCriticalityRating?: string;
  biaFinancialImpact?: string | number | null;
  biaOperationalImpact?: string;
  biaReputationalImpact?: string;
  biaRegulatoryImpact?: string;
  biaMaxTolerableDowntime?: string | number | null;
  biaAssessmentDate?: string;
  testStatus?: BCPTestStatusValue;
  nextTestDate?: string;
  signedOffAt?: string | null;
}

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';

/** True when every BIA field required for sign-off is present. */
export function isBiaComplete(input: BCPStatusInput): boolean {
  return (
    filled(input.biaCriticalityRating) &&
    filled(input.biaFinancialImpact) &&
    filled(input.biaOperationalImpact) &&
    filled(input.biaReputationalImpact) &&
    filled(input.biaRegulatoryImpact) &&
    filled(input.biaMaxTolerableDowntime) &&
    filled(input.biaAssessmentDate)
  );
}

export interface DerivedBCPStatus {
  status: BCPPlanStatus;
  reason: string;
  biaComplete: boolean;
}

/** Same precedence as the server trigger: failed test → BIA → schedule → sign-off → passed test. */
export function deriveBcpStatus(input: BCPStatusInput, now = new Date()): DerivedBCPStatus {
  const biaComplete = isBiaComplete(input);
  const today = new Date(now.toISOString().split('T')[0]);
  const scheduleLapsed =
    input.testStatus === 'Overdue' ||
    (!!input.nextTestDate && new Date(input.nextTestDate) < today);

  if (input.testStatus === 'Failed') {
    return { status: 'Needs Review', reason: 'Latest test failed — remediation required', biaComplete };
  }
  if (!biaComplete) {
    return { status: 'Needs Review', reason: 'Business impact assessment incomplete', biaComplete };
  }
  if (scheduleLapsed) {
    return { status: 'Outdated', reason: 'Test schedule lapsed — next test date has passed', biaComplete };
  }
  if (!input.signedOffAt) {
    return { status: 'Needs Review', reason: 'Awaiting RMD/CRO/ADMIN sign-off', biaComplete };
  }
  if (input.testStatus !== 'Passed') {
    return { status: 'Needs Review', reason: 'No passed test recorded yet', biaComplete };
  }
  return { status: 'Ready', reason: 'BIA complete, test passed and signed off', biaComplete };
}
