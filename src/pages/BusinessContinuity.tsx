import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Download, LayoutList, X, ShieldAlert } from 'lucide-react';
import { ViewBCPDialog } from '@/components/bcp/ViewBCPDialog';
import { ExportBCPMenu } from '@/components/bcp/ExportBCPMenu';
import { BCPKpiCards } from '@/components/bcp/BCPKpiCards';
import { BCPAnalyticsTabs } from '@/components/bcp/BCPAnalyticsTabs';
import { AccessDenied } from '@/components/AccessDenied';
import { verifyBcpSchema } from '@/lib/bcpSchemaCheck';
import { BCPTable, bcpRowsToCSV } from '@/components/bcp/BCPTable';
import { matchesBCPQuickFilter } from '@/lib/bcpMetrics';

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
  owner_id: string;
  created_at: string;
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

interface QuickFilter {
  /** KPI card key — resolved through BCP_QUICK_FILTERS so counts and rows agree. */
  key: string;
  label: string;
}

export default function BusinessContinuity() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BCPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BCPlan | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllRows, setViewAllRows] = useState<BCPlan[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);

  const hasAccess = hasPermission('manage_continuity') || ['RMD', 'CRO', 'ADMIN'].includes(user?.role || '');

  useEffect(() => {
    if (user && hasAccess) {
      verifyBcpSchema();
      fetchBCPs();
    } else if (user && !hasAccess) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasAccess]);

  const fetchBCPs = async () => {
    try {
      setLoading(true);
      if (!user || !hasAccess) {
        setPlans([]);
        return;
      }

      const { data, error } = await supabase
        .from('business_continuity_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message.includes('infinite recursion')) {
          throw new Error('Database configuration error. Please contact administrator.');
        }
        throw error;
      }

      const transformedData = (data || []).map((plan) => ({
        ...plan,
        dependencies: Array.isArray(plan.dependencies) ? plan.dependencies : [],
        mitigation_actions: Array.isArray(plan.mitigation_actions) ? plan.mitigation_actions : [],
        supporting_documents: Array.isArray(plan.supporting_documents) ? plan.supporting_documents : [],
      })) as unknown as BCPlan[];

      setPlans(transformedData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching BCPs:', err);
      setError(err.message || 'Failed to load business continuity plans. Please check your permissions.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlans = useMemo(() => {
    if (!quickFilter) return plans;
    const now = new Date();
    return plans.filter((p) => matchesBCPQuickFilter(p as any, quickFilter.key, now));
  }, [plans, quickFilter]);

  if (!user || !hasAccess) {
    return <AccessDenied message="This module is only available to RMD and critical department heads." />;
  }

  const handleView = (plan: BCPlan) => {
    setSelectedPlan(plan);
    setIsViewDialogOpen(true);
  };

  const handleEdit = (plan: BCPlan) => navigate(`/business-continuity/${plan.id}/edit`);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-md mx-auto mt-8">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Business Continuity Register</h1>
          <p className="text-muted-foreground">
            Plan, assess, test and evidence recovery for every critical business function
          </p>
        </div>
        <div className="flex gap-2">
          <ExportBCPMenu plans={plans} />
          <Button onClick={() => navigate('/business-continuity/new')}>
            <Plus className="w-4 h-4 mr-2" />
            New plan
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">No continuity plans yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The guided wizard walks you through plan basics, mitigation actions, the business impact
              assessment and the test log in a single flow.
            </p>
            <Button className="mt-2" onClick={() => navigate('/business-continuity/new')}>
              <Plus className="w-4 h-4 mr-2" /> Create the first plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <BCPKpiCards
            plans={plans}
            activeFilter={quickFilter?.key ?? null}
            onSelect={(f) =>
              setQuickFilter((prev) => (prev && prev.key === f.key ? null : f))
            }
          />

          <BCPAnalyticsTabs plans={plans} />

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle>Continuity plans</CardTitle>
                {quickFilter && (
                  <Badge variant="secondary" className="gap-1">
                    {quickFilter.label}
                    <button
                      type="button"
                      aria-label="Clear quick filter"
                      onClick={() => setQuickFilter(null)}
                      className="ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setViewAllOpen(true)}>
                <LayoutList className="w-4 h-4 mr-2" />
                View all plans
              </Button>
            </CardHeader>
            <CardContent>
              <BCPTable
                plans={filteredPlans}
                onView={handleView}
                onEdit={handleEdit}
                initialPageSize={10}
                urlKey="rec"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* View All Dialog */}
      <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between gap-2">
            <DialogTitle>All Business Continuity Plans ({plans.length})</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="mr-6"
              onClick={() => {
                const csv = bcpRowsToCSV(viewAllRows.length ? viewAllRows : plans);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `business-continuity-plans-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <BCPTable
              plans={plans}
              onView={handleView}
              onEdit={handleEdit}
              showFilters
              showPagination
              initialPageSize={25}
              storageKey="bcp.viewAll"
              urlKey="all"
              onDisplayRowsChange={setViewAllRows}
            />
          </div>
        </DialogContent>
      </Dialog>

      {selectedPlan && (
        <ViewBCPDialog
          open={isViewDialogOpen}
          onOpenChange={setIsViewDialogOpen}
          plan={selectedPlan as any}
        />
      )}
    </div>
  );
}
