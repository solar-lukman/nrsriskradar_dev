import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, User, Clock, FileText, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BCPVersionHistoryPanel } from './BCPVersionHistoryPanel';

interface BCPlan {
  id: string;
  title: string;
  description: string;
  department: string;
  business_function: string;
  dependencies: string[];
  mitigation_actions: any[];
  recovery_time_objective: number;
  recovery_point_objective: number;
  status: 'Ready' | 'Needs Review' | 'Outdated';
  test_status: 'Not Tested' | 'Passed' | 'Failed' | 'Overdue';
  last_tested_date: string;
  next_test_date: string;
  last_updated_date: string;
  supporting_documents: any[];
  created_at: string;
  owner_profile?: {
    full_name: string;
  };
  bia_criticality_rating?: string;
  bia_financial_impact?: number;
  bia_operational_impact?: string;
  bia_reputational_impact?: string;
  bia_regulatory_impact?: string;
  bia_max_tolerable_downtime?: number;
  bia_assessment_date?: string;
  test_type?: string;
  test_scope?: string;
  test_results?: string;
  test_findings?: any[];
}

interface ViewBCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: BCPlan;
}

export function ViewBCPDialog({ open, onOpenChange, plan }: ViewBCPDialogProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Needs Review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Outdated':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTestStatusColor = (status: string) => {
    switch (status) {
      case 'Passed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Failed':
      case 'Overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Not Tested':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const downloadDocument = async (document: any) => {
    try {
      const { data, error } = await supabase.storage
        .from('bcp-documents')
        .download(document.url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{plan.title}</span>
            <div className="flex gap-2">
              <Badge className={getStatusColor(plan.status)}>
                {plan.status}
              </Badge>
              <Badge className={getTestStatusColor(plan.test_status)}>
                {plan.test_status}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Department</label>
                  <p className="text-sm">{plan.department}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Business Function</label>
                  <p className="text-sm">{plan.business_function}</p>
                </div>
              </div>
              
              {plan.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="text-sm mt-1">{plan.description}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Plan Owner</label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{plan.owner_profile?.full_name || 'Unassigned'}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{new Date(plan.last_updated_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recovery Objectives */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recovery Objectives</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Recovery Time Objective (RTO)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{plan.recovery_time_objective || 'Not specified'} hours</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Recovery Point Objective (RPO)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{plan.recovery_point_objective || 'Not specified'} hours</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dependencies */}
          {plan.dependencies && plan.dependencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.dependencies.map((dep, index) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <span className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      {dep}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Mitigation Actions */}
          {plan.mitigation_actions && plan.mitigation_actions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mitigation Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {plan.mitigation_actions.map((action, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">Action {index + 1}</h4>
                        <Badge variant="outline">{action.status || 'Pending'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{action.action}</p>
                      {action.responsible && (
                        <p className="text-xs text-muted-foreground">
                          Responsible: {action.responsible}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Business Impact Assessment */}
          {(plan.bia_criticality_rating || plan.bia_financial_impact || plan.bia_operational_impact) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  Business Impact Assessment
                  {plan.bia_criticality_rating && (
                    <Badge className={
                      plan.bia_criticality_rating === 'Critical' ? 'bg-red-100 text-red-800 border-red-200' :
                      plan.bia_criticality_rating === 'High' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                      plan.bia_criticality_rating === 'Medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                      'bg-green-100 text-green-800 border-green-200'
                    }>
                      {plan.bia_criticality_rating}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.bia_financial_impact && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Financial Impact</label>
                    <p className="text-sm">₦{plan.bia_financial_impact.toLocaleString()}</p>
                  </div>
                )}
                {plan.bia_operational_impact && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Operational Impact</label>
                    <p className="text-sm mt-1">{plan.bia_operational_impact}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {plan.bia_reputational_impact && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Reputational Impact</label>
                      <p className="text-sm mt-1">{plan.bia_reputational_impact}</p>
                    </div>
                  )}
                  {plan.bia_regulatory_impact && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Regulatory Impact</label>
                      <p className="text-sm mt-1">{plan.bia_regulatory_impact}</p>
                    </div>
                  )}
                </div>
                {plan.bia_max_tolerable_downtime && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Max Tolerable Downtime</label>
                    <p className="text-sm">{plan.bia_max_tolerable_downtime} hours</p>
                  </div>
                )}
                {plan.bia_assessment_date && (
                  <div className="text-xs text-muted-foreground">
                    BIA assessed on: {new Date(plan.bia_assessment_date).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Test Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Tested</label>
                  <p className="text-sm mt-1">
                    {plan.last_tested_date ? new Date(plan.last_tested_date).toLocaleDateString() : 'Never tested'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Next Test Date</label>
                  <p className="text-sm mt-1">
                    {plan.next_test_date ? new Date(plan.next_test_date).toLocaleDateString() : 'Not scheduled'}
                  </p>
                </div>
              </div>
              {plan.test_type && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Test Type</label>
                    <p className="text-sm mt-1">{plan.test_type}</p>
                  </div>
                  {plan.test_scope && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Test Scope</label>
                      <p className="text-sm mt-1">{plan.test_scope}</p>
                    </div>
                  )}
                </div>
              )}
              {plan.test_results && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Test Results</label>
                  <p className="text-sm mt-1">{plan.test_results}</p>
                </div>
              )}
              {plan.test_findings && plan.test_findings.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Test Findings</label>
                  <div className="space-y-2">
                    {plan.test_findings.map((finding: any, idx: number) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-medium">{finding.description}</span>
                          <Badge variant="outline">{finding.severity}</Badge>
                        </div>
                        {finding.recommendation && (
                          <p className="text-xs text-muted-foreground">Recommendation: {finding.recommendation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Supporting Documents */}
          {plan.supporting_documents && plan.supporting_documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Supporting Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {plan.supporting_documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{doc.name}</p>
                          {doc.uploaded_at && (
                            <p className="text-xs text-muted-foreground">
                              Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadDocument(doc)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          <BCPVersionHistoryPanel bcpId={plan.id} />

          {/* Close Button */}
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}