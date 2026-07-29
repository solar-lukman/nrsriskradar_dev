import { useState } from 'react';
import { CheckCircle, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
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
import { useToast } from '@/hooks/use-toast';
import { applyRiskWorkflowTransition } from '@/lib/riskWorkflow';

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onComplete: () => void;
}

const CONCURRENCY = 4;

export function BulkApprovalBar({ selectedIds, onClear, onComplete }: Props) {
  const { toast } = useToast();
  const [pending, setPending] = useState<'approve' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, ok: 0, fail: 0 });

  if (selectedIds.length === 0) return null;

  const run = async () => {
    if (!pending) return;
    const total = selectedIds.length;
    setBusy(true);
    setProgress({ done: 0, ok: 0, fail: 0 });

    const queue = [...selectedIds];
    let ok = 0;
    let fail = 0;
    let done = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        try {
          await applyRiskWorkflowTransition({
            riskId: id,
            action: pending,
            reason: reason.trim() || undefined,
          });
          ok++;
        } catch {
          fail++;
        } finally {
          done++;
          setProgress({ done, ok, fail });
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
    await Promise.all(workers);

    setBusy(false);
    setPending(null);
    setReason('');
    setProgress({ done: 0, ok: 0, fail: 0 });
    toast({
      title: 'Bulk action complete',
      description: `${ok} succeeded${fail ? `, ${fail} failed` : ''}.`,
      variant: fail > 0 ? 'destructive' : 'default',
    });
    onComplete();
    onClear();
  };

  const total = selectedIds.length;
  const pct = total > 0 ? Math.round((progress.done / total) * 100) : 0;

  return (
    <>
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card shadow-lg p-3 mt-4">
        <div className="text-sm font-medium">
          {selectedIds.length} selected
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-success border-success/40"
            onClick={() => setPending('approve')}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            Approve all
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40"
            onClick={() => setPending('return')}
          >
            <Undo2 className="w-4 h-4 mr-1.5" />
            Return all
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === 'approve' ? 'Approve' : 'Return'} {selectedIds.length} risks?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === 'approve'
                ? 'Each selected risk will be approved and enter the active register. An approval note (recorded against every item in the audit log) is required.'
                : 'Each selected risk will be returned to its submitter with the same comment below.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={
              pending === 'approve'
                ? 'Approval note for the audit log (required, min 5 chars)'
                : 'Shared comment for all returned items (required, min 5 chars)'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            disabled={busy}
          />
          {busy && (
            <div className="space-y-2">
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground">
                Processed {progress.done} of {total} — {progress.ok} succeeded
                {progress.fail > 0 ? `, ${progress.fail} failed` : ''}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || reason.trim().length < 5}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {busy ? `Working… ${pct}%` : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
