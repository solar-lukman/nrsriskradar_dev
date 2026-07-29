/**
 * Derives an assessment progress stage from existing risk fields and the
 * count of risk_assessments rows. No new DB column is required.
 *
 * Stages:
 *  - draft:      no assessments recorded yet
 *  - in_review:  at least one assessment exists OR risk is going through
 *                approval (Submitted / Under Review / Returned)
 *  - completed:  at least one assessment exists AND the risk is Approved
 */
export type AssessmentProgress = 'draft' | 'in_review' | 'completed';

export interface AssessmentProgressInput {
  approval_status?: string | null;
  status?: string | null;
  assessment_count?: number;
}

export function deriveAssessmentProgress(input: AssessmentProgressInput): AssessmentProgress {
  const count = input.assessment_count ?? 0;
  const approval = (input.approval_status || '').toString();
  const status = (input.status || '').toString();

  if (count === 0 && approval === 'Draft') return 'draft';
  if (approval === 'Approved' && (count > 0 || status === 'Mitigated')) return 'completed';
  if (count > 0 || ['Submitted', 'Under Review', 'Returned'].includes(approval)) return 'in_review';
  return 'draft';
}

export function progressLabel(p: AssessmentProgress): string {
  switch (p) {
    case 'draft': return 'Draft';
    case 'in_review': return 'In Review';
    case 'completed': return 'Completed';
  }
}

export function progressBadgeVariant(p: AssessmentProgress): 'secondary' | 'warning' | 'success' {
  switch (p) {
    case 'draft': return 'secondary';
    case 'in_review': return 'warning';
    case 'completed': return 'success';
  }
}
