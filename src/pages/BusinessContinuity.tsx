import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, FileText, Download, LayoutList } from 'lucide-react';
import { AddBCPDialog } from '@/components/bcp/AddBCPDialog';
import { EditBCPDialog } from '@/components/bcp/EditBCPDialog';
import { ViewBCPDialog } from '@/components/bcp/ViewBCPDialog';
import { ExportBCPMenu } from '@/components/bcp/ExportBCPMenu';
import { BIASummaryWidget } from '@/components/bcp/BIASummaryWidget';
import { AccessDenied } from '@/components/AccessDenied';
import { verifyBcpSchema } from '@/lib/bcpSchemaCheck';
import { BCPTable, bcpRowsToCSV } from '@/components/bcp/BCPTable';

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

export default function BusinessContinuity() {
  const { user, hasPermission } = useAuth();
  const [plans, setPlans] = useState<BCPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BCPlan | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllRows, setViewAllRows] = useState<BCPlan[]>([]);

  const hasAccess = hasPermission('manage_continuity') || ['RMD', 'CRO', 'ADMIN'].includes(user?.role || '');

  useEffect(() => {
    if (user && hasAccess) {
      verifyBcpSchema();
      fetchBCPs();
    } else if (user && !hasAccess) {
      setLoading(false);
    }
  }, [user, hasAccess]);

  const fetchBCPs = async () => {
    try {
      setLoading(true);
      console.log('Fetching BCP plans...');
      
      if (!user) {
        console.log('No user authenticated, skipping BCP fetch');
        setPlans([]);
        return;
      }

      if (!hasAccess) {
        console.log('User has no BCP access, skipping fetch');
        setPlans([]);
        return;
      }
      
      // Query business continuity plans with proper error handling
      const { data, error } = await supabase
        .from('business_continuity_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('BCP fetch error:', error);
        if (error.message.includes('infinite recursion')) {
          throw new Error('Database configuration error. Please contact administrator.');
        }
        throw error;
      }
      
      console.log('BCP plans fetched successfully:', data?.length || 0);
      
      // Transform the data to match our interface
      const transformedData = (data || []).map(plan => ({
        ...plan,
        dependencies: Array.isArray(plan.dependencies) ? plan.dependencies : [],
        mitigation_actions: Array.isArray(plan.mitigation_actions) ? plan.mitigation_actions : [],
        supporting_documents: Array.isArray(plan.supporting_documents) ? plan.supporting_documents : []
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

  // Check if user has access
  if (!user || !hasAccess) {
    return (
      <AccessDenied message="This module is only available to RMD and critical department heads." />
    );
  }

  const handleEdit = (plan: BCPlan) => {
    setSelectedPlan(plan);
    setIsEditDialogOpen(true);
  };

  const handleView = (plan: BCPlan) => {
    setSelectedPlan(plan);
    setIsViewDialogOpen(true);
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Business Continuity Register</h1>
          <p className="text-muted-foreground">
            Manage business continuity plans and recovery procedures
          </p>
        </div>
        <div className="flex gap-2">
          <ExportBCPMenu plans={plans} />
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add BCP
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Plans</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plans.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready</CardTitle>
            <div className="w-3 h-3 bg-green-500 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {plans.filter(p => p.status === 'Ready').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Need Review</CardTitle>
            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {plans.filter(p => p.status === 'Needs Review').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outdated</CardTitle>
            <div className="w-3 h-3 bg-red-500 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {plans.filter(p => p.status === 'Outdated').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BIA Summary */}
      <BIASummaryWidget plans={plans} />

      {/* Recent BCP Table (first 10) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Business Continuity Plans</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setViewAllOpen(true)}>
            <LayoutList className="w-4 h-4 mr-2" />
            View all plans
          </Button>
        </CardHeader>
        <CardContent>
          <BCPTable
            plans={plans}
            onView={handleView}
            onEdit={handleEdit}
            initialPageSize={10}
            urlKey="rec"
          />
        </CardContent>
      </Card>

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

      {/* Dialogs */}
      <AddBCPDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={fetchBCPs}
      />

      {selectedPlan && (
        <>
          <EditBCPDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            plan={selectedPlan}
            onSuccess={fetchBCPs}
          />
          <ViewBCPDialog
            open={isViewDialogOpen}
            onOpenChange={setIsViewDialogOpen}
            plan={selectedPlan}
          />
        </>
      )}
    </div>
  );
}