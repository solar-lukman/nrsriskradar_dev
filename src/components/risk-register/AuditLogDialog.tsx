import React, { useState, useEffect } from 'react';
import { History, Workflow, Send, Eye, CheckCircle, Undo2, AlertOctagon, ArrowRight, Activity, Sparkles, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AuditLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId: string;
}

interface AuditLog {
  id: string;
  action: string;
  changes: any;
  performed_at: string;
  performed_by_profile: {
    full_name: string;
    email: string;
  };
}

interface WorkflowEntry {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  actor_role: string | null;
  comments: string | null;
  metadata: any;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_department: string | null;
}

const WORKFLOW_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  submitted: Send,
  reviewed: Eye,
  approved: CheckCircle,
  returned: Undo2,
  escalated: AlertOctagon,
};

const WORKFLOW_TONE: Record<string, string> = {
  submitted: 'text-primary',
  reviewed: 'text-warning',
  approved: 'text-success',
  returned: 'text-destructive',
  escalated: 'text-destructive',
};

export function AuditLogDialog({ open, onOpenChange, riskId }: AuditLogDialogProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [auditRes, workflowRes] = await Promise.all([
          supabase
            .from('risk_audit_logs')
            .select(`*, performed_by_profile:profiles!performed_by(full_name, email)`)
            .eq('risk_id', riskId)
            .order('performed_at', { ascending: false }),
          supabase
            .from('risk_workflow_audit_view' as any)
            .select('*')
            .eq('risk_id', riskId)
            .order('created_at', { ascending: false }),
        ]);

        if (auditRes.error) throw auditRes.error;
        setLogs((auditRes.data as any) || []);

        if (workflowRes.error) {
          console.warn('workflow audit fetch failed', workflowRes.error);
          setWorkflow([]);
        } else {
          setWorkflow((workflowRes.data as any) || []);
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch audit logs',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (open && riskId) {
      fetchAll();
    }
  }, [open, riskId, toast]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'success';
      case 'updated': return 'warning';
      case 'deleted': return 'destructive';
      default: return 'secondary';
    }
  };

  const formatChanges = (changes: any) => {
    if (!changes) return null;

    if (changes.before && changes.after) {
      // Fields that are noisy and not user-meaningful (system-managed, AI-generated, derived)
      const HIDDEN = new Set([
        // System / timestamps
        'updated_at', 'created_at', 'id', 'risk_reference',
        // AI-generated fields
        'ai_score_generated_at', 'ai_analyzed_at', 'ai_score_status',
        'ai_score_reasoning', 'ai_score_explanation', 'ai_predicted_score',
        'ai_recommended_likelihood', 'ai_recommended_impact', 'ai_confidence',
        // Internal workflow plumbing duplicated elsewhere in the workflow tab
        'submitted_at', 'submitted_by', 'approved_at', 'approved_by',
        'returned_at', 'returned_by', 'current_reviewer_id',
        'crystallized_at',
      ]);

      const FIELD_LABELS: Record<string, string> = {
        title: 'Title',
        description: 'Description',
        category: 'Category',
        department: 'Department',
        risk_type: 'Risk Type',
        status: 'Status',
        approval_status: 'Approval Status',
        inherent_likelihood: 'Inherent Likelihood',
        inherent_impact: 'Inherent Impact',
        residual_likelihood: 'Residual Likelihood',
        residual_impact: 'Residual Impact',
        treatment_strategy: 'Treatment Strategy',
        mitigation_plan: 'Mitigation Plan',
        mitigation_budget: 'Mitigation Budget',
        mitigation_budget_spent: 'Budget Spent',
        target_date: 'Target Date',
        review_date: 'Review Date',
        review_frequency: 'Review Frequency',
        owner_id: 'Owner',
        assigned_to_id: 'Assigned To',
        strategic_objective: 'Strategic Objective',
        flagged_for_audit: 'Flagged for Audit',
        last_review_comment: 'Review Comment',
        crystallization_status: 'Crystallization Status',
        actual_impact_amount: 'Actual Impact Amount',
        tax_type: 'Tax Type',
        taxpayer_segment: 'Taxpayer Segment',
        estimated_tax_at_risk: 'Estimated Tax at Risk',
        tax_sector: 'Sector',
        tax_sub_sector: 'Sub-Sector',
        compliance_description: 'Compliance Description',
        information_sources: 'Information Sources',
        treatment_owner_id: 'Treatment Owner',
        monitoring_officer_id: 'Monitoring Officer',
        treatment_timeline: 'Treatment Timeline',
        control_effectiveness_score: 'Control Effectiveness',
        target_control_score: 'Target Control Score',
      };

      const labelFor = (key: string) =>
        FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      const formatValue = (v: any): string => {
        if (v === null || v === undefined || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        if (Array.isArray(v)) {
          if (v.length === 0) return '—';
          return v.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ');
        }
        if (typeof v === 'object') return JSON.stringify(v);
        const s = String(v);
        // Nicely shorten ISO timestamps to dates
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
          try { return new Date(s).toLocaleString(); } catch { return s; }
        }
        return s;
      };

      const changedFields = Object.keys(changes.after).filter((key) => {
        if (HIDDEN.has(key)) return false;
        return JSON.stringify(changes.before[key]) !== JSON.stringify(changes.after[key]);
      });

      if (changedFields.length === 0) {
        return <p className="text-xs text-muted-foreground italic">No user-visible field changes.</p>;
      }

      return (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium w-[28%]">Field</th>
                <th className="text-left px-3 py-2 font-medium">Before</th>
                <th className="px-2 py-2 w-6" />
                <th className="text-left px-3 py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map((field, idx) => (
                <tr key={field} className={cn('border-t', idx % 2 === 1 && 'bg-muted/20')}>
                  <td className="px-3 py-2 font-medium align-top">{labelFor(field)}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-block rounded bg-destructive/10 text-destructive px-1.5 py-0.5 break-words">
                      {formatValue(changes.before[field])}
                    </span>
                  </td>
                  <td className="px-1 py-2 text-muted-foreground align-top">
                    <ArrowRight className="w-3 h-3" />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-block rounded bg-success/10 text-success px-1.5 py-0.5 break-words">
                      {formatValue(changes.after[field])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="text-xs">
        <pre className="whitespace-pre-wrap text-muted-foreground bg-muted/30 p-2 rounded">
          {JSON.stringify(changes, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <History className="w-5 h-5 mr-2" />
            Audit Log
          </DialogTitle>
          <DialogDescription>
            Complete history of changes and approval workflow events for this risk
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="status">
              <Activity className="w-4 h-4 mr-1.5" />
              Status Timeline
            </TabsTrigger>
            <TabsTrigger value="workflow">
              <Workflow className="w-4 h-4 mr-1.5" />
              Workflow ({workflow.length})
            </TabsTrigger>
            <TabsTrigger value="changes">
              <History className="w-4 h-4 mr-1.5" />
              Field Changes ({logs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-3 mt-4">
            <StatusTimeline logs={logs} workflow={workflow} loading={loading} />
          </TabsContent>

          <TabsContent value="workflow" className="space-y-3 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : workflow.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Workflow className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No workflow events recorded yet.</p>
                <p className="text-xs mt-1">Submit, review, approve, return, or escalate actions will appear here.</p>
              </div>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-4">
                {workflow.map((entry) => {
                  const Icon = WORKFLOW_ICON[entry.action] || Workflow;
                  const tone = WORKFLOW_TONE[entry.action] || 'text-muted-foreground';
                  return (
                    <li key={entry.id} className="ml-6">
                      <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-background border ${tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">{entry.action}</Badge>
                              {entry.from_status && (
                                <span className="text-xs text-muted-foreground">
                                  {entry.from_status} → <span className="font-medium text-foreground">{entry.to_status}</span>
                                </span>
                              )}
                              {!entry.from_status && (
                                <span className="text-xs text-muted-foreground">
                                  → <span className="font-medium text-foreground">{entry.to_status}</span>
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">{entry.actor_name || entry.actor_email || 'Unknown user'}</span>
                            {entry.actor_role && (
                              <span className="text-muted-foreground"> · {entry.actor_role}</span>
                            )}
                            {entry.actor_department && (
                              <span className="text-muted-foreground"> · {entry.actor_department}</span>
                            )}
                          </div>
                          {entry.comments && (
                            <div className="rounded-md bg-muted/50 p-2 text-sm border-l-2 border-primary">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                                {entry.action === 'returned' ? 'Reason for return' : entry.action === 'escalated' ? 'Reason for escalation' : 'Comments'}
                              </p>
                              {entry.comments}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="changes" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No field changes recorded for this risk.</p>
              </div>
            ) : (
              logs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <Badge variant={getActionColor(log.action) as any}>
                          {log.action.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {log.performed_by_profile?.full_name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.performed_at).toLocaleString()}
                      </span>
                    </div>

                    {log.action === 'updated' && formatChanges(log.changes)}

                    {log.action === 'created' && (
                      <div className="text-xs text-muted-foreground">
                        Risk was created with initial values
                      </div>
                    )}

                    {log.action === 'deleted' && (
                      <div className="text-xs text-muted-foreground">
                        Risk was permanently deleted
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Timeline ───────────────────────────────────────────────────────────
// Combines `risk_audit_logs` status_changed entries with workflow events to give
// a single chronological view of every status transition (who, when, from → to).

interface StatusTimelineProps {
  logs: AuditLog[];
  workflow: WorkflowEntry[];
  loading: boolean;
}

interface StatusTimelineEntry {
  id: string;
  source: 'audit' | 'workflow' | 'created';
  timestamp: string;
  actor: string;
  actorRole?: string | null;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  comments?: string | null;
}

function buildStatusTimeline(logs: AuditLog[], workflow: WorkflowEntry[]): StatusTimelineEntry[] {
  const entries: StatusTimelineEntry[] = [];

  for (const log of logs) {
    if (log.action === 'created') {
      const after = (log.changes && (log.changes.after || log.changes)) || {};
      entries.push({
        id: `created-${log.id}`,
        source: 'created',
        timestamp: log.performed_at,
        actor: log.performed_by_profile?.full_name || log.performed_by_profile?.email || 'System',
        fromStatus: null,
        toStatus: (after.status as string) || 'Draft',
        action: 'created',
      });
    } else if (log.action === 'status_changed' && log.changes) {
      entries.push({
        id: `audit-${log.id}`,
        source: 'audit',
        timestamp: log.performed_at,
        actor: log.performed_by_profile?.full_name || log.performed_by_profile?.email || 'System',
        fromStatus: log.changes.from || null,
        toStatus: log.changes.to || '—',
        action: 'status changed',
      });
    }
  }

  for (const w of workflow) {
    entries.push({
      id: `wf-${w.id}`,
      source: 'workflow',
      timestamp: w.created_at,
      actor: w.actor_name || w.actor_email || 'Unknown user',
      actorRole: w.actor_role,
      fromStatus: w.from_status,
      toStatus: w.to_status,
      action: w.action,
      comments: w.comments,
    });
  }

  // De-duplicate on (timestamp ± 1s, toStatus, actor) — workflow + trigger may double-record
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const key = `${Math.floor(new Date(e.timestamp).getTime() / 1000)}|${e.toStatus}|${e.actor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

const STATUS_TONE: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Submitted: 'bg-secondary text-secondary-foreground',
  'Under Review': 'bg-warning/20 text-warning-foreground',
  'In Review': 'bg-warning/20 text-warning-foreground',
  Approved: 'bg-success/20 text-success',
  Returned: 'bg-destructive/20 text-destructive',
  New: 'bg-secondary text-secondary-foreground',
  Mitigated: 'bg-success/20 text-success',
  Escalated: 'bg-destructive/20 text-destructive',
  Crystallized: 'bg-destructive/20 text-destructive',
};

function StatusTimeline({ logs, workflow, loading }: StatusTimelineProps) {
  const entries = React.useMemo(() => buildStatusTimeline(logs, workflow), [logs, workflow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No status changes recorded yet.</p>
        <p className="text-xs mt-1">
          Every time the risk status changes — by you, a reviewer, or the system — it appears here.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {entries.map((e) => {
        const Icon =
          e.source === 'created' ? Plus :
          e.action === 'submitted' ? Send :
          e.action === 'reviewed' ? Eye :
          e.action === 'approved' ? CheckCircle :
          e.action === 'returned' ? Undo2 :
          e.action === 'escalated' ? AlertOctagon :
          Sparkles;
        const tone =
          e.action === 'approved' ? 'text-success' :
          e.action === 'returned' || e.action === 'escalated' ? 'text-destructive' :
          e.source === 'created' ? 'text-primary' :
          'text-warning';
        return (
          <li key={e.id} className="ml-6">
            <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-background border ${tone}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="capitalize">{e.action}</Badge>
                    <div className="flex items-center gap-1.5 text-xs">
                      {e.fromStatus && (
                        <>
                          <span className={cn('px-1.5 py-0.5 rounded font-medium', STATUS_TONE[e.fromStatus] || 'bg-muted')}>
                            {e.fromStatus}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        </>
                      )}
                      <span className={cn('px-1.5 py-0.5 rounded font-semibold', STATUS_TONE[e.toStatus] || 'bg-primary/10 text-primary')}>
                        {e.toStatus}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{e.actor}</span>
                  {e.actorRole && <span className="text-muted-foreground"> · {e.actorRole}</span>}
                </div>
                {e.comments && (
                  <div className="rounded-md bg-muted/50 p-2 text-sm border-l-2 border-primary">
                    {e.comments}
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
