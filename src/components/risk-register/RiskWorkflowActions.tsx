import React, { useState } from 'react';
import { Send, Eye, CheckCircle, Undo2, AlertOctagon, XCircle, ArrowDownCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyRiskWorkflowTransition,
  canPerformWorkflowAction,
  type ApprovalStatus,
  type RiskStatus,
  type WorkflowAction,
} from '@/lib/riskWorkflow';

interface Props {
  riskId: string;
  status: RiskStatus;
  approvalStatus?: ApprovalStatus;
  /** ID of the user who originally submitted/created the risk — needed for "withdraw" gating. */
  submittedBy?: string | null;
  createdBy?: string | null;
  /** ID of the user currently reviewing — needed for "withdraw" gating. */
  currentReviewerId?: string | null;
  onChanged?: () => void;
  variant?: 'icons' | 'buttons';
}

const ICONS: Record<WorkflowAction, React.ComponentType<{ className?: string }>> = {
  submit: Send,
  review: Eye,
  approve: CheckCircle,
  return: Undo2,
  reject: Undo2,
  withdraw: XCircle,
  escalate: AlertOctagon,
  deescalate: ArrowDownCircle,
};

const LABELS: Record<WorkflowAction, string> = {
  submit: 'Submit for Review',
  review: 'Claim for Review',
  approve: 'Approve',
  return: 'Return for Revision',
  reject: 'Return for Revision',
  withdraw: 'Withdraw Submission',
  escalate: 'Escalate',
  deescalate: 'De-escalate',
};

export function RiskWorkflowActions({
  riskId,
  status,
  approvalStatus,
  submittedBy,
  createdBy,
  currentReviewerId,
  onChanged,
  variant = 'icons',
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<WorkflowAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefer approval_status when present; fall back to lifecycle status for older rows
  const gatingStatus: ApprovalStatus | RiskStatus = approvalStatus ?? status;
  const isSubmitter = !!user && (user.id === submittedBy || user.id === createdBy);
  const hasReviewer = !!currentReviewerId;

  const actions: WorkflowAction[] = (
    ['submit', 'review', 'approve', 'return', 'withdraw', 'escalate', 'deescalate'] as const
  ).filter((a) =>
    canPerformWorkflowAction(a, gatingStatus, user?.role, {
      lifecycleStatus: status,
      isSubmitter,
      hasReviewer,
    })
  );

  if (actions.length === 0 || !user) return null;

  const confirm = async () => {
    if (!pendingAction) return;
    setBusy(true);
    try {
      const next = await applyRiskWorkflowTransition({
        riskId,
        action: pendingAction,
        reason: reason.trim() || undefined,
      });
      toast({
        title: 'Workflow updated',
        description: `Approval is now "${next.approvalStatus}".`,
      });
      setPendingAction(null);
      setReason('');
      onChanged?.();
    } catch (err: any) {
      const msg = err?.message || 'Could not update risk status';
      const isClaimConflict = msg.includes('CLAIM_CONFLICT');
      toast({
        title: isClaimConflict ? 'Already claimed' : 'Action failed',
        description: isClaimConflict
          ? 'Another reviewer has already claimed this risk. The list will refresh.'
          : msg,
        variant: 'destructive',
      });
      if (isClaimConflict) {
        setPendingAction(null);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const requiresReason =
    pendingAction === 'approve' ||
    pendingAction === 'return' ||
    pendingAction === 'reject' ||
    pendingAction === 'escalate' ||
    pendingAction === 'deescalate';

  const MIN_REASON_LEN = 5;
  const reasonTooShort = requiresReason && reason.trim().length < MIN_REASON_LEN;

  const tone = (action: WorkflowAction) =>
    action === 'approve'
      ? 'text-success'
      : action === 'return' || action === 'reject' || action === 'escalate' || action === 'withdraw'
      ? 'text-destructive'
      : action === 'review' || action === 'deescalate'
      ? 'text-warning'
      : 'text-primary';

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        {actions.map((action) => {
          const Icon = ICONS[action];
          if (variant === 'buttons') {
            return (
              <Button
                key={action}
                variant="outline"
                size="sm"
                onClick={() => setPendingAction(action)}
                className={tone(action)}
              >
                <Icon className="w-4 h-4 mr-1.5" />
                {LABELS[action]}
              </Button>
            );
          }
          return (
            <Tooltip key={action}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setPendingAction(action)}>
                  <Icon className={`w-4 h-4 ${tone(action)}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{LABELS[action]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <AlertDialog open={pendingAction !== null} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction ? LABELS[pendingAction] : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === 'submit' &&
                'Submit this risk for reviewer approval. Core fields will be locked while it is in review.'}
              {pendingAction === 'review' &&
                'Claim this risk for review. It will move to "Under Review" and be assigned to you. If another reviewer claims it first you will be notified.'}
              {pendingAction === 'approve' &&
                'Approve this risk. It will enter the active register and become available for treatment. An approval note is required for the audit trail.'}
              {(pendingAction === 'return' || pendingAction === 'reject') &&
                'Return this risk to the submitter for revision. Comments are required and will be visible to the author. The risk will be restored to its previous lifecycle status.'}
              {pendingAction === 'withdraw' &&
                'Withdraw this submission and return it to your drafts. You can edit and resubmit later. Only available before a reviewer claims it.'}
              {pendingAction === 'escalate' &&
                'Escalate this risk to executive attention. Please record the reason for escalation.'}
              {pendingAction === 'deescalate' &&
                'De-escalate this risk and return it to standard review. Please record the reason.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {requiresReason && (
            <div className="space-y-1.5">
              <Textarea
                placeholder={
                  pendingAction === 'approve'
                    ? 'Approval note for the audit log (required, min 5 chars)'
                    : pendingAction === 'escalate'
                    ? 'Reason for escalation (required, min 5 chars)'
                    : pendingAction === 'deescalate'
                    ? 'Reason for de-escalation (required, min 5 chars)'
                    : 'Comments for the author (required, min 5 chars)'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                aria-invalid={reasonTooShort && reason.length > 0}
              />
              {reasonTooShort && reason.length > 0 && (
                <p className="text-xs text-destructive">
                  Please enter at least {MIN_REASON_LEN} characters.
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (requiresReason && reasonTooShort)}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              {busy ? 'Working…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
