import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Calendar, TrendingUp, Sparkles, Flag, Clock, Target, AlertTriangle, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBudgetForecast } from '@/hooks/useBudgetForecast';
import { AIScoreIndicator } from './AIScoreIndicator';
import { MitigationRecommendationsDialog } from './MitigationRecommendationsDialog';
import { MitigationTasksPanel } from './MitigationTasksPanel';
import { RiskAttachmentsPanel } from './RiskAttachmentsPanel';
import { RiskEventsSection } from './RiskEventsSection';
import { ReportCrystallizedDialog } from './ReportCrystallizedDialog';
import { RiskAssessmentDialog } from '../risk-assessment/RiskAssessmentDialog';
import { AssessmentProgressBadge } from '../risk-assessment/AssessmentProgressBadge';
import { RiskWorkflowActions } from './RiskWorkflowActions';
import { PendingAgeBadge } from './PendingAgeBadge';
import { AppetiteMatchPanel } from './AppetiteMatchPanel';
import { PostControlReassessmentSection } from './PostControlReassessmentSection';
import { supabase } from '@/integrations/supabase/client';

interface ViewRiskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: any;
  /** Called after edits made inside child modals (e.g. assessment dashboard)
   *  so the parent list can refetch and reflect changes immediately. */
  onChanged?: () => void;
}

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(risk: any): string {
  const ref = (risk?.risk_reference || risk?.id || 'risk').toString().replace(/[^a-z0-9_-]+/gi, '-');
  return `approval-audit-${ref}-${new Date().toISOString().slice(0, 10)}`;
}

function exportApprovalHistoryCSV(rows: any[], risk: any) {
  const headers = ['Action', 'From Status', 'To Status', 'Actor', 'Role', 'Timestamp', 'Comments'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.action,
      r.from_status,
      r.to_status,
      r.actor_name,
      r.actor_role,
      new Date(r.created_at).toISOString(),
      r.comments,
    ].map(csvEscape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${safeFilename(risk)}.csv`);
}

function exportApprovalHistoryPDF(rows: any[], risk: any) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Approval Audit Trail', margin, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Risk: ${risk?.risk_reference || risk?.id || ''}`, margin, y);
  y += 13;
  if (risk?.title) {
    const titleLines = doc.splitTextToSize(`Title: ${risk.title}`, pageWidth - margin * 2);
    doc.text(titleLines, margin, y);
    y += 13 * titleLines.length;
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 18;

  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  doc.setFontSize(9);
  rows.forEach((r, idx) => {
    if (y > pageHeight - margin - 60) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    const header = `${idx + 1}. ${String(r.action || '').toUpperCase()}` +
      (r.from_status || r.to_status ? `  (${r.from_status || '—'} → ${r.to_status || '—'})` : '');
    doc.text(header, margin, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    const meta = `${r.actor_name || 'Unknown'}${r.actor_role ? ` (${r.actor_role})` : ''} · ${new Date(r.created_at).toLocaleString()}`;
    doc.text(meta, margin, y);
    y += 12;

    if (r.comments) {
      const cmt = doc.splitTextToSize(`Comments: ${r.comments}`, pageWidth - margin * 2);
      if (y + cmt.length * 11 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(cmt, margin, y);
      y += 11 * cmt.length;
    }
    y += 8;
  });

  doc.save(`${safeFilename(risk)}.pdf`);
}

export function ViewRiskDialog({ open, onOpenChange, risk, onChanged }: ViewRiskDialogProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMitigationDialog, setShowMitigationDialog] = useState(false);
  const [showCrystallizedDialog, setShowCrystallizedDialog] = useState(false);
  const [showAssessmentDialog, setShowAssessmentDialog] = useState(false);
  const [assessmentRefreshKey, setAssessmentRefreshKey] = useState(0);
  const [, forceUpdate] = useState(0);
  const [riskHistory, setRiskHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  
  const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
  const residualScore = risk.residual_likelihood * risk.residual_impact;
  const { forecasts, loading: forecastLoading } = useBudgetForecast();
  
  const riskForecast = forecasts.find(f => f.riskId === risk.id);

  // Fetch risk history
  useEffect(() => {
    if (!open) return;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      const { data } = await supabase
        .from('risk_history')
        .select('*')
        .eq('risk_id', risk.id)
        .order('changed_at', { ascending: false })
        .limit(10);
      setRiskHistory(data || []);
      setHistoryLoading(false);
    };
    fetchHistory();
  }, [open, risk.id]);

  // Fetch approval history (audit trail of workflow actions with comments)
  useEffect(() => {
    if (!open) return;
    const fetchApproval = async () => {
      setApprovalLoading(true);
      const { data } = await supabase
        .from('approval_history')
        .select('id, action, from_status, to_status, actor_id, actor_role, comments, created_at')
        .eq('risk_id', risk.id)
        .order('created_at', { ascending: false })
        .limit(25);
      const rows = data || [];
      const actorIds = Array.from(new Set(rows.map((r: any) => r.actor_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', actorIds);
        nameMap = Object.fromEntries((profs || []).map((p: any) => [p.user_id, p.full_name]));
      }
      setApprovalHistory(rows.map((r: any) => ({ ...r, actor_name: nameMap[r.actor_id] || 'Unknown' })));
      setApprovalLoading(false);
    };
    fetchApproval();
  }, [open, risk.id]);

  // URL state: open the assessment modal when ?assess=1 is present, and
  // keep the URL in sync as the user toggles it. This makes refreshes and
  // shared links restore the modal automatically.
  useEffect(() => {
    if (!open) return;
    const wantsAssess = searchParams.get('assess') === '1';
    setShowAssessmentDialog(wantsAssess);
  }, [open, searchParams]);

  const handleAssessmentDialogChange = (next: boolean) => {
    setShowAssessmentDialog(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set('assess', '1');
    else params.delete('assess');
    setSearchParams(params, { replace: true });
  };

  const getRiskLevel = (score: number) => {
    if (score >= 20) return { level: 'Critical', color: 'destructive' };
    if (score >= 15) return { level: 'High', color: 'warning' };
    if (score >= 8) return { level: 'Medium', color: 'primary' };
    return { level: 'Low', color: 'success' };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'secondary';
      case 'In Review': return 'warning';
      case 'Mitigated': return 'success';
      case 'Escalated': return 'destructive';
      case 'Crystallized': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Eye className="w-5 h-5 mr-2" />
              Risk Details
            </div>
            <div className="flex items-center gap-2">
              <AIScoreIndicator
                riskId={risk.id}
                currentLikelihood={risk.residual_likelihood}
                currentImpact={risk.residual_impact}
                aiRecommendedLikelihood={risk.ai_recommended_likelihood}
                aiRecommendedImpact={risk.ai_recommended_impact}
                aiConfidence={risk.ai_confidence}
                aiReasoning={risk.ai_score_reasoning}
                aiStatus={risk.ai_score_status}
                onScoreApplied={() => forceUpdate(n => n + 1)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1 text-primary hover:bg-primary/10"
                onClick={() => setShowMitigationDialog(true)}
              >
                <Sparkles className="w-3 h-3" />
                <span className="text-xs">AI Mitigation</span>
              </Button>
              {!['Mitigated', 'Crystallized'].includes(risk.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCrystallizedDialog(true)}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-xs">Report Crystallized</span>
                </Button>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            Complete information about this risk
          </DialogDescription>
          <div className="pt-2 flex items-center gap-2 flex-wrap">
            {risk.approval_status === 'Submitted' && (
              <PendingAgeBadge since={risk.submitted_at} label="Pending review" />
            )}
            {risk.approval_status === 'Under Review' && (
              <PendingAgeBadge since={risk.submitted_at} label="Under review" />
            )}
            {risk.approval_status === 'Returned' && (
              <PendingAgeBadge since={risk.returned_at} label="Returned" />
            )}
            {risk.status === 'Escalated' && (
              <span className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded-full">
                ⚠ Escalated
              </span>
            )}
            <AssessmentProgressBadge
              riskId={risk.id}
              approvalStatus={risk.approval_status}
              status={risk.status}
              refreshKey={assessmentRefreshKey}
            />
            <RiskWorkflowActions
              riskId={risk.id}
              status={risk.status as any}
              approvalStatus={(risk as any).approval_status}
              submittedBy={(risk as any).submitted_by}
              createdBy={(risk as any).created_by}
              currentReviewerId={(risk as any).current_reviewer_id}
              variant="buttons"
              onChanged={() => onOpenChange(false)}
            />
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Audit Flag Banner */}
          {risk.flagged_for_audit && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
              <Flag className="w-4 h-4" />
              <span className="font-medium">Flagged for Audit Review</span> — Residual risk has been high for {risk.consecutive_high_assessments || 2}+ consecutive assessments
            </div>
          )}

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Basic Information</span>
                {risk.risk_reference && (
                  <Badge variant="outline" className="font-mono text-xs">{risk.risk_reference}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{risk.title}</h3>
                <p className="text-muted-foreground">{risk.description}</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Category</span>
                  <div><Badge variant="outline">{risk.category}</Badge></div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Status</span>
                  <div><Badge variant={getStatusColor(risk.status) as any}>{risk.status}</Badge></div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Department</span>
                  <div>{risk.department || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Owner</span>
                  <div>{risk.owner_profile?.full_name || 'Unassigned'}</div>
                </div>
              </div>

              {/* New fields row */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <span className="text-sm text-muted-foreground">Treatment Strategy</span>
                  <div><Badge variant="outline">{risk.treatment_strategy || 'Mitigate'}</Badge></div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Review Frequency</span>
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    {risk.review_frequency ? risk.review_frequency.charAt(0).toUpperCase() + risk.review_frequency.slice(1) : 'Quarterly'}
                  </div>
                </div>
                {risk.strategic_objective && (
                  <div>
                    <span className="text-sm text-muted-foreground">Strategic Objective</span>
                    <div className="flex items-center gap-1 text-sm">
                      <Target className="w-3 h-3 text-muted-foreground" />
                      {risk.strategic_objective}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compliance Details — only for compliance register */}
          {((risk.risk_type || '').toString().toLowerCase() === 'compliance') && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Compliance Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Tax Type</span>
                    <div className="font-medium">{risk.tax_type || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Taxpayer Segment</span>
                    <div className="font-medium">{risk.taxpayer_segment || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Estimated Tax at Risk</span>
                    <div className="font-bold text-warning">
                      {risk.estimated_tax_at_risk
                        ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(risk.estimated_tax_at_risk))
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Sector</span>
                    <div>{risk.tax_sector || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Sub-Sector</span>
                    <div>{risk.tax_sub_sector || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Treatment Timeline</span>
                    <div>{risk.treatment_timeline || 'N/A'}</div>
                  </div>
                </div>

                {risk.compliance_description && (
                  <div className="pt-2 border-t border-warning/20">
                    <span className="text-sm text-muted-foreground">Compliance Description</span>
                    <p className="text-sm mt-1">{risk.compliance_description}</p>
                  </div>
                )}

                {risk.information_sources && (
                  <div>
                    <span className="text-sm text-muted-foreground">Information Sources</span>
                    <p className="text-sm mt-1">{risk.information_sources}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-warning/20">
                  <div>
                    <span className="text-sm text-muted-foreground">Treatment Owner</span>
                    <div className="text-sm">{risk.treatment_owner_profile?.full_name || (risk.treatment_owner_id ? 'Assigned' : 'Unassigned')}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Monitoring Officer</span>
                    <div className="text-sm">{risk.monitoring_officer_profile?.full_name || (risk.monitoring_officer_id ? 'Assigned' : 'Unassigned')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Inherent Risk</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Likelihood:</span>
                      <span className="font-medium">{risk.inherent_likelihood}/5</span>
                    </div>
                    {risk.inherent_likelihood_rationale && (
                      <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                        <span className="font-medium">Rationale: </span>
                        {risk.inherent_likelihood_rationale}
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Impact:</span>
                      <span className="font-medium">{risk.inherent_impact}/5</span>
                    </div>
                    {risk.inherent_impact_rationale && (
                      <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                        <span className="font-medium">Rationale: </span>
                        {risk.inherent_impact_rationale}
                      </div>
                    )}
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Score:</span>
                      <Badge variant={getRiskLevel(inherentScore).color as any}>
                        {getRiskLevel(inherentScore).level} ({inherentScore})
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Residual Risk</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Likelihood:</span>
                      <span className="font-medium">{risk.residual_likelihood}/5</span>
                    </div>
                    {risk.residual_likelihood_rationale && (
                      <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                        <span className="font-medium">Rationale: </span>
                        {risk.residual_likelihood_rationale}
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Impact:</span>
                      <span className="font-medium">{risk.residual_impact}/5</span>
                    </div>
                    {risk.residual_impact_rationale && (
                      <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                        <span className="font-medium">Rationale: </span>
                        {risk.residual_impact_rationale}
                      </div>
                    )}
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Score:</span>
                      <Badge variant={getRiskLevel(residualScore).color as any}>
                        {getRiskLevel(residualScore).level} ({residualScore})
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appetite Match */}
          <AppetiteMatchPanel risk={risk} />

          {/* Post-Control Reassessment */}
          <PostControlReassessmentSection risk={risk} onUpdated={() => forceUpdate(n => n + 1)} />

          {/* Mitigation Plan */}
          {(risk.mitigation_plan || risk.mitigation_budget || risk.mitigation_budget_spent !== undefined) && (
            <Card>
              <CardHeader>
                <CardTitle>Mitigation Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {risk.mitigation_plan && (
                  <p className="text-sm">{risk.mitigation_plan}</p>
                )}
                
                {(risk.mitigation_budget || risk.mitigation_budget_spent !== undefined) && (
                  <div className={risk.mitigation_plan ? "border-t pt-4" : ""}>
                    <h5 className="font-medium mb-3">Budget Information</h5>
                    
                    {risk.mitigation_budget && risk.mitigation_budget_spent !== undefined && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Budget Utilization</span>
                          <span className="font-medium">
                            {((Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress 
                          value={(Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100} 
                          className={`h-3 ${
                            (Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100 > 90 
                              ? '[&>div]:bg-destructive' 
                              : (Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100 > 75 
                              ? '[&>div]:bg-warning' 
                              : '[&>div]:bg-success'
                          }`}
                        />
                        {(Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100 > 75 && (
                          <div className={`text-xs mt-1 ${
                            (Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100 > 90 
                              ? 'text-destructive' 
                              : 'text-warning'
                          }`}>
                            ⚠️ {(Number(risk.mitigation_budget_spent) / Number(risk.mitigation_budget)) * 100 > 90 
                              ? 'Critical: Budget utilization exceeds 90%' 
                              : 'Warning: Budget utilization exceeds 75%'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Budget Forecast */}
                    {!forecastLoading && riskForecast && riskForecast.dailySpendRate > 0 && (
                      <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-center gap-2 text-sm font-medium mb-2">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <span className="text-primary">Budget Forecast</span>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Daily Spend Rate:</span>
                            <span className="font-medium">
                              NGN {riskForecast.dailySpendRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </div>

                          {riskForecast.daysTo75Percent !== null && riskForecast.daysTo75Percent > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Days to 75% threshold:</span>
                              <span className="font-medium text-warning">
                                ~{Math.round(riskForecast.daysTo75Percent)} days
                              </span>
                            </div>
                          )}

                          {riskForecast.daysTo90Percent !== null && riskForecast.daysTo90Percent > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Days to 90% threshold:</span>
                              <span className="font-medium text-destructive">
                                ~{Math.round(riskForecast.daysTo90Percent)} days
                              </span>
                            </div>
                          )}

                          {riskForecast.projectedExceededDate && (
                            <div className="flex items-center justify-between pt-2 border-t">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span>Projected Depletion:</span>
                              </div>
                              <span className="font-medium">
                                {riskForecast.projectedExceededDate.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {risk.mitigation_budget && (
                        <div>
                          <span className="text-muted-foreground">Total Budget</span>
                          <div className="font-medium">
                            {risk.mitigation_budget_currency || 'NGN'} {Number(risk.mitigation_budget).toLocaleString()}
                          </div>
                        </div>
                      )}
                      {risk.mitigation_budget_spent !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Amount Spent</span>
                          <div className="font-medium">
                            {risk.mitigation_budget_currency || 'NGN'} {Number(risk.mitigation_budget_spent).toLocaleString()}
                          </div>
                        </div>
                      )}
                      {risk.mitigation_budget && risk.mitigation_budget_spent !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Remaining</span>
                          <div className="font-medium">
                            {risk.mitigation_budget_currency || 'NGN'} {(Number(risk.mitigation_budget) - Number(risk.mitigation_budget_spent)).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mitigation Tasks */}
          <Card>
            <CardHeader>
              <CardTitle>Mitigation Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <MitigationTasksPanel riskId={risk.id} />
            </CardContent>
          </Card>

          {/* Documents & Evidence */}
          <Card>
            <CardHeader>
              <CardTitle>Documents & Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              <RiskAttachmentsPanel riskId={risk.id} />
            </CardContent>
          </Card>

          {/* Risk Events (Crystallized) */}
          <RiskEventsSection riskId={risk.id} riskStatus={risk.status} />

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Important Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <div>{new Date(risk.created_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Updated</span>
                  <div>{new Date(risk.updated_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Target Date</span>
                  <div>{risk.target_date ? new Date(risk.target_date).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Review Date</span>
                  <div>{risk.review_date ? new Date(risk.review_date).toLocaleDateString() : 'N/A'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Risk History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="text-sm text-muted-foreground">Loading history...</div>
              ) : riskHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">No change history recorded yet.</div>
              ) : (
                <ScrollArea className="max-h-48">
                  <div className="space-y-3">
                    {riskHistory.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3">
                        <div className="flex-1">
                          <div className="font-medium">{entry.change_summary || 'Record updated'}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(entry.changed_at).toLocaleString()}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{entry.change_type}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Approval Audit Trail */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Approval Audit Trail
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={approvalHistory.length === 0}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => exportApprovalHistoryCSV(approvalHistory, risk)}
                    >
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => exportApprovalHistoryPDF(approvalHistory, risk)}
                    >
                      Export as PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approvalLoading ? (
                <div className="text-sm text-muted-foreground">Loading audit trail...</div>
              ) : approvalHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">No approval actions recorded yet.</div>
              ) : (
                <ScrollArea className="max-h-64">
                  <div className="space-y-3">
                    {approvalHistory.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 text-sm border-l-2 border-primary/40 pl-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">{entry.action}</span>
                            {entry.from_status && (
                              <span className="text-xs text-muted-foreground">
                                {entry.from_status} → {entry.to_status}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.actor_name}
                            {entry.actor_role ? ` (${entry.actor_role})` : ''} ·{' '}
                            {new Date(entry.created_at).toLocaleString()}
                          </div>
                          {entry.comments && (
                            <div className="mt-1 text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap">
                              {entry.comments}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => handleAssessmentDialogChange(true)}>
            Detailed Assessment
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <MitigationRecommendationsDialog
      open={showMitigationDialog}
      onOpenChange={setShowMitigationDialog}
      riskId={risk.id}
      riskTitle={risk.title}
    />

    <ReportCrystallizedDialog
      open={showCrystallizedDialog}
      onOpenChange={setShowCrystallizedDialog}
      risk={risk}
      onSuccess={() => {
        forceUpdate(n => n + 1);
        onOpenChange(false);
      }}
    />

    <RiskAssessmentDialog
      open={showAssessmentDialog}
      onOpenChange={handleAssessmentDialogChange}
      riskId={risk.id}
      onChanged={() => {
        setAssessmentRefreshKey((k) => k + 1);
        forceUpdate((n) => n + 1);
        onChanged?.();
      }}
    />
    </>
  );
}