import type { UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Workflow lifecycle for risks. Reflects the risk_status enum in the DB:
// Draft → Submitted → Approved → New/In Review → Mitigated
// Plus terminal Crystallized (handled by ReportCrystallizedDialog) and Escalated.

export type RiskStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'New'
  | 'In Review'
  | 'Mitigated'
  | 'Escalated'
  | 'Crystallized';

/**
 * Allowed `risks.status` enum values (must mirror the `risk_status` Postgres enum).
 * Used by the wizard for pre-submit validation and by the strategy-mapping settings UI.
 */
export const VALID_RISK_STATUSES: readonly RiskStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'New',
  'In Review',
  'Mitigated',
  'Escalated',
  'Crystallized',
] as const;

export function isValidRiskStatus(value: unknown): value is RiskStatus {
  return typeof value === 'string' && (VALID_RISK_STATUSES as readonly string[]).includes(value);
}

// Phase 3 approval pipeline. Lives in `risks.approval_status` and is
// orthogonal to `risks.status` (which represents the risk lifecycle).
export type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Returned';

export type WorkflowAction =
  | 'submit'      // RC/RO → Submitted
  | 'review'      // RR → Under Review (claim for review, with claim-lock)
  | 'approve'     // Supervisor/CRO/RMD/ADMIN → Approved
  | 'return'      // Supervisor/RR → Returned (with comments, restores pre-submission status)
  | 'reject'      // legacy alias of return — kept for backwards compatibility
  | 'withdraw'    // submitter cancels a submission (only while Submitted, no reviewer)
  | 'escalate'    // raise to executive attention
  | 'deescalate'; // ADMIN/CRO/RMD only — return an escalated risk to review

const SUBMITTERS: UserRole[] = ['RC', 'RO', 'RMD', 'ADMIN'];
const REVIEWERS: UserRole[] = ['RR', 'RMD', 'CRO', 'ADMIN'];
const APPROVERS: UserRole[] = ['RR', 'SUPERVISOR', 'CRO', 'RMD', 'ADMIN'];
const DEESCALATORS: UserRole[] = ['ADMIN', 'CRO', 'RMD'];

interface CanPerformContext {
  approvalStatus: ApprovalStatus | RiskStatus;
  role: UserRole | undefined;
  /** Lifecycle status — needed for de-escalate gating. */
  lifecycleStatus?: RiskStatus;
  /** True if the current user is the submitter/author. */
  isSubmitter?: boolean;
  /** True if the risk has already been claimed by a reviewer. */
  hasReviewer?: boolean;
}

export function canPerformWorkflowAction(
  action: WorkflowAction,
  approvalStatus: ApprovalStatus | RiskStatus,
  role: UserRole | undefined,
  context: Omit<CanPerformContext, 'approvalStatus' | 'role'> = {}
): boolean {
  if (!role) return false;
  const { lifecycleStatus, isSubmitter, hasReviewer } = context;
  switch (action) {
    case 'submit':
      return (approvalStatus === 'Draft' || approvalStatus === 'Returned') && SUBMITTERS.includes(role);
    case 'review':
      return approvalStatus === 'Submitted' && REVIEWERS.includes(role);
    case 'approve':
      return (approvalStatus === 'Submitted' || approvalStatus === 'Under Review') && APPROVERS.includes(role);
    case 'reject':
    case 'return':
      return (approvalStatus === 'Submitted' || approvalStatus === 'Under Review') &&
        (REVIEWERS.includes(role) || APPROVERS.includes(role));
    case 'withdraw':
      return approvalStatus === 'Submitted' && !hasReviewer && (isSubmitter === true || role === 'ADMIN');
    case 'escalate':
      return APPROVERS.includes(role) && approvalStatus !== 'Approved' && lifecycleStatus !== 'Crystallized' && lifecycleStatus !== 'Mitigated';
    case 'deescalate':
      return DEESCALATORS.includes(role) && lifecycleStatus === 'Escalated';
    default:
      return false;
  }
}

interface TransitionOptions {
  riskId: string;
  action: WorkflowAction;
  /** Kept for API compatibility; the RPC uses auth.uid() directly. */
  performedBy?: string;
  reason?: string;
}

interface TransitionResult {
  status: RiskStatus;
  approvalStatus: ApprovalStatus;
  action: string;
}

/**
 * Apply a workflow transition atomically via the `apply_workflow_transition` RPC.
 * The RPC updates the risks row, enforces the claim-lock for `review`, restores
 * `pre_submission_status` on `return`, and writes the `approval_history` entry —
 * all in one transaction.
 *
 * Throws an Error with a tagged message:
 *  - "CLAIM_CONFLICT: …" when another reviewer claimed first
 *  - any other DB error
 */
export async function applyRiskWorkflowTransition({
  riskId,
  action,
  reason,
}: TransitionOptions): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('apply_workflow_transition' as any, {
    p_risk_id: riskId,
    p_action: action,
    p_reason: reason ?? null,
  } as any);

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as { status?: RiskStatus; approval_status?: ApprovalStatus; action?: string };
  return {
    status: (payload.status as RiskStatus) ?? 'Draft',
    approvalStatus: (payload.approval_status as ApprovalStatus) ?? 'Draft',
    action: payload.action ?? action,
  };
}

export function statusBadgeVariant(status: RiskStatus | ApprovalStatus): string {
  switch (status) {
    case 'Draft':
      return 'outline';
    case 'Submitted':
      return 'secondary';
    case 'Under Review':
      return 'warning';
    case 'Approved':
      return 'primary';
    case 'Returned':
      return 'destructive';
    case 'New':
      return 'secondary';
    case 'In Review':
      return 'warning';
    case 'Mitigated':
      return 'success';
    case 'Escalated':
    case 'Crystallized':
      return 'destructive';
    default:
      return 'secondary';
  }
}
