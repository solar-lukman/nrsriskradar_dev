import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, Plus, Search, Filter, Upload, Eye, Calendar, User, Building, 
  Target, TrendingUp, FileText, History, Sparkles, Database, Flag, Edit, Trash2, Zap,
  Landmark, Receipt
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ViewRiskDialog } from '@/components/risk-register/ViewRiskDialog';
import { AuditLogDialog } from '@/components/risk-register/AuditLogDialog';
import { BulkUploadDialog } from '@/components/risk-register/BulkUploadDialog';
import { ExportRisksMenu } from '@/components/risk-register/ExportRisksMenu';
import { AIScoreIndicator } from '@/components/risk-register/AIScoreIndicator';
import { MitigationRecommendationsDialog } from '@/components/risk-register/MitigationRecommendationsDialog';
import { BatchAIAnalysisButton } from '@/components/risk-register/BatchAIAnalysisButton';
import { LoBDataImportDialog } from '@/components/risk-register/LoBDataImportDialog';
import { RiskWizardDialog } from '@/components/risk-register/RiskWizardDialog';
import { ReportCrystallizedDialog } from '@/components/risk-register/ReportCrystallizedDialog';
import { RiskWorkflowActions } from '@/components/risk-register/RiskWorkflowActions';
import { PendingAgeBadge } from '@/components/risk-register/PendingAgeBadge';
import type { RiskStatus } from '@/lib/riskWorkflow';
import { useSearchParams } from 'react-router-dom';
import { AccessDenied } from '@/components/AccessDenied';
import { useRiskCategories } from '@/hooks/useRiskCategories';

type RegisterTab = 'institutional' | 'compliance';

interface Risk {
  id: string;
  risk_reference?: string | null;
  risk_type?: RegisterTab | string;
  title: string;
  description: string;
  category: string;
  department: string;
  owner_id: string;
  assigned_to_id: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  status: RiskStatus;
  treatment_strategy: string | null;
  strategic_objective: string | null;
  review_frequency: string | null;
  flagged_for_audit: boolean;
  consecutive_high_assessments: number;
  mitigation_plan: string;
  mitigation_actions: any;
  target_date: string;
  review_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  owner_profile?: { full_name: string; email: string };
  assigned_to_profile?: { full_name: string; email: string };
  created_by_profile?: { full_name: string; email: string };
  inherent_likelihood_rationale?: string | null;
  inherent_impact_rationale?: string | null;
  residual_likelihood_rationale?: string | null;
  residual_impact_rationale?: string | null;
  mitigation_budget?: number | null;
  mitigation_budget_spent?: number | null;
  mitigation_budget_currency?: string | null;
  ai_recommended_likelihood: number | null;
  ai_recommended_impact: number | null;
  ai_confidence: number | null;
  ai_score_reasoning: string | null;
  ai_score_status: string | null;
  // Compliance fields
  tax_type?: string | null;
  estimated_tax_at_risk?: number | null;
  taxpayer_segment?: string | null;
  tax_sector?: string | null;
  tax_sub_sector?: string | null;
  compliance_description?: string | null;
  information_sources?: string | null;
  treatment_owner_id?: string | null;
  monitoring_officer_id?: string | null;
  treatment_timeline?: string | null;
  control_effectiveness_rating?: string | null;
}

export default function RiskRegister() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [showMitigationDialog, setShowMitigationDialog] = useState(false);
  const [showLoBImportDialog, setShowLoBImportDialog] = useState(false);
  const [showCrystallizedDialog, setShowCrystallizedDialog] = useState(false);
  const [crystallizedRisk, setCrystallizedRisk] = useState<Risk | null>(null);
  const urlFilter = searchParams.get('filter');
  const initialTab: RegisterTab = searchParams.get('register') === 'compliance' ? 'compliance' : 'institutional';
  const [registerTab, setRegisterTab] = useState<RegisterTab>(initialTab);
  const [severityFilter, setSeverityFilter] = useState<string>(urlFilter === 'high-priority' ? 'high' : 'all');
  
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category: '',
    department: '',
    owner: '',
    controlEffectiveness: '',
    taxpayerSegment: '',
  });

  const TAXPAYER_SEGMENT_OPTIONS = ['Large Taxpayers', 'Medium Taxpayers', 'Emerging Taxpayers'];

  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const hasAccess = hasPermission('view_risks') || ['RC', 'RR', 'RO', 'RMD', 'ADMIN'].includes(user?.role || '');
  const canEdit = hasPermission('add_risk') || ['RC', 'RO', 'RMD', 'ADMIN'].includes(user?.role || '');
  const canDelete = ['RMD', 'ADMIN'].includes(user?.role || '');

  const fetchRisks = async () => {
    try {
      setLoading(true);
      if (!user || !hasAccess) { setRisks([]); return; }

      const { data, error } = await supabase
        .from('risks')
        .select('*')
        .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

      if (error) throw error;
      setRisks((data || []) as unknown as Risk[]);
    } catch (error: any) {
      console.error('Error fetching risks:', error);
      toast({ title: 'Error', description: error.message || 'Failed to fetch risks.', variant: 'destructive' });
      setRisks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && hasAccess) {
      fetchRisks();
    } else if (user) {
      setLoading(false);
    }
  }, [user, hasAccess, sortConfig]);

  // Deep-link: open ViewRiskDialog when ?view=<risk-id> is present
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || risks.length === 0) return;
    const target = risks.find((r) => r.id === viewId);
    if (!target) {
      toast({
        title: 'Risk not found',
        description: 'The linked risk is not visible to you or has been removed.',
        variant: 'destructive',
      });
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
      return;
    }
    // Switch to the matching register tab if needed
    const tab: RegisterTab =
      ((target.risk_type as string) || 'institutional').toLowerCase() === 'compliance'
        ? 'compliance'
        : 'institutional';
    if (tab !== registerTab) setRegisterTab(tab);
    setSelectedRisk(target);
    setShowViewDialog(true);
  }, [searchParams, risks]);

  // Clear ?view= when the dialog is closed
  const handleViewDialogChange = (open: boolean) => {
    setShowViewDialog(open);
    if (!open && searchParams.get('view')) {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  };

  const filteredRisks = useMemo(() => {
    return risks.filter(risk => {
      const rType = ((risk.risk_type as string) || 'institutional').toLowerCase();
      if (rType !== registerTab) return false;
      const matchesSearch = !filters.search || 
        risk.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        risk.description.toLowerCase().includes(filters.search.toLowerCase());
      const matchesStatus = !filters.status || risk.status === filters.status;
      const matchesCategory = !filters.category || risk.category === filters.category;
      const matchesDepartment = !filters.department || risk.department === filters.department;
      const matchesOwner = !filters.owner || risk.owner_id === filters.owner;
      const matchesTaxpayerSegment =
        !filters.taxpayerSegment || risk.taxpayer_segment === filters.taxpayerSegment;
      const matchesControlEff =
        !filters.controlEffectiveness ||
        (filters.controlEffectiveness === 'none'
          ? !risk.control_effectiveness_rating
          : (risk.control_effectiveness_rating || '').toLowerCase() ===
            filters.controlEffectiveness.toLowerCase());
      const riskScore = risk.inherent_likelihood * risk.inherent_impact;
      const matchesSeverity = severityFilter === 'all' || 
        (severityFilter === 'high' && riskScore >= 15) ||
        (severityFilter === 'medium' && riskScore >= 10 && riskScore < 15) ||
        (severityFilter === 'low' && riskScore < 10);
      const matchesUrlOpen = urlFilter !== 'open' || risk.status !== 'Mitigated';
      const matchesUrlOverdue = urlFilter !== 'overdue' || (!!risk.review_date && new Date(risk.review_date).getTime() < Date.now());
      const matchesUrlMitigated = urlFilter !== 'mitigated' || risk.status === 'Mitigated';
      const matchesUrlEscalated = urlFilter !== 'escalated' || risk.status === 'Escalated';
      const matchesUrlCrystallized = urlFilter !== 'crystallized' || risk.status === 'Crystallized';
      return matchesSearch && matchesStatus && matchesCategory && matchesDepartment && matchesOwner && matchesControlEff && matchesSeverity && matchesUrlOpen && matchesUrlOverdue && matchesUrlMitigated && matchesUrlEscalated && matchesUrlCrystallized && matchesTaxpayerSegment;
    });
  }, [risks, filters, severityFilter, urlFilter, registerTab]);

  const registerCounts = useMemo(() => ({
    institutional: risks.filter(r => (((r.risk_type as string) || 'institutional').toLowerCase()) === 'institutional').length,
    compliance: risks.filter(r => ((r.risk_type as string) || '').toLowerCase() === 'compliance').length,
  }), [risks]);

  const { categories: categoryRows } = useRiskCategories({ riskType: registerTab });

  const uniqueValues = useMemo(() => ({
    statuses: [...new Set(risks.map(r => r.status))],
    categories: categoryRows.length > 0
      ? categoryRows.map(c => c.name)
      : [...new Set(risks.map(r => r.category))],
    departments: [...new Set(risks.map(r => r.department).filter(Boolean))],
  }), [risks, categoryRows]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDeleteRisk = async (riskId: string) => {
    if (!canDelete) return;
    try {
      const { error } = await supabase.from('risks').delete().eq('id', riskId);
      if (error) throw error;
      toast({ title: 'Success', description: 'Risk deleted successfully' });
      fetchRisks();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete risk', variant: 'destructive' });
    }
  };

  const getRiskLevelColor = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    if (score >= 20) return 'destructive';
    if (score >= 15) return 'warning';
    if (score >= 8) return 'primary';
    return 'success';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'outline';
      case 'Submitted': return 'secondary';
      case 'Approved': return 'primary';
      case 'New': return 'secondary';
      case 'In Review': return 'warning';
      case 'Mitigated': return 'success';
      case 'Escalated': return 'destructive';
      case 'Crystallized': return 'destructive';
      default: return 'secondary';
    }
  };

  if (!hasAccess) {
    return <AccessDenied message="You do not have permission to access the Risk Register." />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Risk Register</h1>
            <p className="text-muted-foreground">
              {registerTab === 'compliance'
                ? 'Track taxpayer compliance risks across NRS revenue streams'
                : 'Manage and track organizational risks, mitigation plans, and ownership'}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <BatchAIAnalysisButton risks={filteredRisks} onComplete={fetchRisks} />
            
            <Button variant="outline" onClick={() => setShowLoBImportDialog(true)} disabled={!canEdit}>
              <Database className="w-4 h-4 mr-2" />
              LoB Import
            </Button>

            <Button variant="outline" onClick={() => setShowBulkUploadDialog(true)} disabled={!canEdit}>
              <Upload className="w-4 h-4 mr-2" />
              Bulk Upload
            </Button>
            
            <ExportRisksMenu risks={filteredRisks} register={registerTab} />
            
            {canEdit && (
              <Button onClick={() => { setEditingRisk(null); setShowRiskDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add {registerTab === 'compliance' ? 'Compliance Risk' : 'Risk'}
              </Button>
            )}
          </div>
        </div>

        {/* Register Type Tabs */}
        <Tabs
          value={registerTab}
          onValueChange={(v) => {
            setRegisterTab(v as RegisterTab);
            setFilters({ search: '', status: '', category: '', department: '', owner: '', controlEffectiveness: '', taxpayerSegment: '' });
            setSeverityFilter('all');
            const next = new URLSearchParams(searchParams);
            if (v === 'compliance') next.set('register', 'compliance'); else next.delete('register');
            setSearchParams(next);
          }}
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="institutional" className="gap-2">
              <Landmark className="w-4 h-4" />
              Institutional
              <Badge variant="secondary" className="ml-1">{registerCounts.institutional}</Badge>
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2">
              <Receipt className="w-4 h-4" />
              Compliance
              <Badge variant="secondary" className="ml-1">{registerCounts.compliance}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Statistics Cards */}
        {(() => {
          const tabRisks = risks.filter(r => (((r.risk_type as string) || 'institutional').toLowerCase()) === registerTab);
          const totalTaxAtRisk = tabRisks.reduce((sum, r) => sum + (Number(r.estimated_tax_at_risk) || 0), 0);
          const ngnFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
          const tabLabel = registerTab === 'compliance' ? 'Compliance' : 'Institutional';
          return (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{tabLabel} Risks</p>
                      <p className="text-2xl font-bold">{tabRisks.length}</p>
                    </div>
                    <AlertTriangle className="w-8 h-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">High Risk</p>
                      <p className="text-2xl font-bold text-destructive">
                        {tabRisks.filter(r => (r.inherent_likelihood * r.inherent_impact) >= 15).length}
                      </p>
                    </div>
                    <Target className="w-8 h-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>
              {registerTab === 'compliance' ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Tax at Risk</p>
                        <p className="text-xl font-bold text-warning truncate" title={ngnFmt.format(totalTaxAtRisk)}>
                          {ngnFmt.format(totalTaxAtRisk)}
                        </p>
                      </div>
                      <Receipt className="w-8 h-8 text-warning" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">In Review</p>
                        <p className="text-2xl font-bold text-warning">
                          {tabRisks.filter(r => r.status === 'In Review').length}
                        </p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-warning" />
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Mitigated</p>
                      <p className="text-2xl font-bold text-success">
                        {tabRisks.filter(r => r.status === 'Mitigated').length}
                      </p>
                    </div>
                    <FileText className="w-8 h-8 text-success" />
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search risks..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
              <Select value={filters.status || "all-statuses"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v === "all-statuses" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-statuses">All Statuses</SelectItem>
                  {uniqueValues.statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.category || "all-categories"} onValueChange={(v) => setFilters(prev => ({ ...prev, category: v === "all-categories" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-categories">All Categories</SelectItem>
                  {uniqueValues.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.department || "all-departments"} onValueChange={(v) => setFilters(prev => ({ ...prev, department: v === "all-departments" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-departments">All Departments</SelectItem>
                  {uniqueValues.departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={filters.controlEffectiveness || 'all-eff'}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    controlEffectiveness: v === 'all-eff' ? '' : v,
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Control Effectiveness" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-eff">All Effectiveness</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="none">Not rated</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.taxpayerSegment || 'all-segments'}
                onValueChange={(v) =>
                  setFilters((prev) => ({
                    ...prev,
                    taxpayerSegment: v === 'all-segments' ? '' : v,
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="All Taxpayer Segments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-segments">All Taxpayer Segments</SelectItem>
                  {TAXPAYER_SEGMENT_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setFilters({ search: '', status: '', category: '', department: '', owner: '', controlEffectiveness: '', taxpayerSegment: '' }); setSeverityFilter('all'); setSearchParams({}); }}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Risk Table */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Entries ({filteredRisks.length} of {risks.length} risks shown)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('title')}>Risk Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Control Effectiveness</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('created_at')}>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRisks.map((risk) => {
                      const riskScore = risk.inherent_likelihood * risk.inherent_impact;
                      const riskLevel = riskScore >= 20 ? 'Critical' : riskScore >= 15 ? 'High' : riskScore >= 8 ? 'Medium' : 'Low';
                      
                      return (
                        <TableRow key={risk.id}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {risk.flagged_for_audit && (
                                <Tooltip>
                                  <TooltipTrigger><Flag className="w-3.5 h-3.5 text-destructive" /></TooltipTrigger>
                                  <TooltipContent>Flagged for Audit Review</TooltipContent>
                                </Tooltip>
                              )}
                              {risk.status === 'Crystallized' && (
                                <Tooltip>
                                  <TooltipTrigger><Zap className="w-3.5 h-3.5 text-destructive" /></TooltipTrigger>
                                  <TooltipContent>Crystallized Risk</TooltipContent>
                                </Tooltip>
                              )}
                              <div>
                                <div className="font-medium">{risk.title}</div>
                                <div className="text-sm text-muted-foreground truncate max-w-xs">{risk.description}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{risk.category}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={getStatusColor(risk.status) as any}>{risk.status}</Badge>
                              {(risk as any).approval_status === 'Submitted' && (
                                <PendingAgeBadge since={(risk as any).submitted_at} label="Pending" />
                              )}
                              {(risk as any).approval_status === 'Under Review' && (
                                <PendingAgeBadge since={(risk as any).submitted_at} label="Reviewing" />
                              )}
                              {(risk as any).approval_status === 'Returned' && (
                                <PendingAgeBadge since={(risk as any).returned_at} label="Returned" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant={getRiskLevelColor(risk.inherent_likelihood, risk.inherent_impact) as any}>{riskLevel} ({riskScore})</Badge></TableCell>
                          <TableCell>
                            {risk.control_effectiveness_rating ? (
                              <Badge
                                variant="outline"
                                className={
                                  risk.control_effectiveness_rating === 'High'
                                    ? 'border-success text-success'
                                    : risk.control_effectiveness_rating === 'Medium'
                                    ? 'border-warning text-warning'
                                    : 'border-destructive text-destructive'
                                }
                              >
                                {risk.control_effectiveness_rating}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <User className="w-4 h-4 mr-1 text-muted-foreground" />
                              <span className="text-sm">{risk.owner_id || 'Unassigned'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Building className="w-4 h-4 mr-1 text-muted-foreground" />
                              <span className="text-sm">{risk.department || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                              <span className="text-sm">{new Date(risk.created_at).toLocaleDateString()}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <RiskWorkflowActions
                                riskId={risk.id}
                                status={risk.status}
                                approvalStatus={(risk as any).approval_status}
                                submittedBy={(risk as any).submitted_by}
                                createdBy={risk.created_by}
                                currentReviewerId={(risk as any).current_reviewer_id}
                                onChanged={fetchRisks}
                              />
                              <AIScoreIndicator
                                riskId={risk.id}
                                currentLikelihood={risk.residual_likelihood}
                                currentImpact={risk.residual_impact}
                                aiRecommendedLikelihood={risk.ai_recommended_likelihood}
                                aiRecommendedImpact={risk.ai_recommended_impact}
                                aiConfidence={risk.ai_confidence}
                                aiReasoning={risk.ai_score_reasoning}
                                aiStatus={risk.ai_score_status}
                                onScoreApplied={fetchRisks}
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedRisk(risk); setShowViewDialog(true); }}>
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View Details</TooltipContent>
                              </Tooltip>
                              {canEdit && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setEditingRisk(risk); setShowRiskDialog(true); }}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Risk</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedRisk(risk); setShowMitigationDialog(true); }}>
                                    <Sparkles className="w-4 h-4 text-primary" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>AI Mitigation Recommendations</TooltipContent>
                              </Tooltip>
                              {canEdit && !['Mitigated', 'Crystallized'].includes(risk.status) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setCrystallizedRisk(risk); setShowCrystallizedDialog(true); }}>
                                      <Zap className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Report as Crystallized</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedRisk(risk); setShowAuditDialog(true); }}>
                                    <History className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Audit Log</TooltipContent>
                              </Tooltip>
                              {canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { if (confirm('Are you sure you want to delete this risk?')) handleDeleteRisk(risk.id); }}>
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Risk</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredRisks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No risks match the current filters.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unified Risk Wizard Dialog (Add + Edit) */}
        <RiskWizardDialog
          open={showRiskDialog}
          onOpenChange={setShowRiskDialog}
          onSuccess={fetchRisks}
          risk={editingRisk}
          defaultRiskType={registerTab}
        />

        {showViewDialog && selectedRisk && (
          <ViewRiskDialog
            open={showViewDialog}
            onOpenChange={handleViewDialogChange}
            risk={selectedRisk}
            onChanged={() => {
              fetchRisks();
              // Refresh the selectedRisk reference so the open dialog
              // reflects the latest values without being closed.
              supabase
                .from('risks')
                .select('*')
                .eq('id', selectedRisk.id)
                .single()
                .then(({ data }) => data && setSelectedRisk(data as unknown as Risk));
            }}
          />
        )}

        {showAuditDialog && selectedRisk && (
          <AuditLogDialog open={showAuditDialog} onOpenChange={setShowAuditDialog} riskId={selectedRisk.id} />
        )}

        {showBulkUploadDialog && (
          <BulkUploadDialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog} onSuccess={fetchRisks} register={registerTab} />
        )}

        {showMitigationDialog && selectedRisk && (
          <MitigationRecommendationsDialog open={showMitigationDialog} onOpenChange={setShowMitigationDialog} riskId={selectedRisk.id} riskTitle={selectedRisk.title} />
        )}

        {showLoBImportDialog && (
          <LoBDataImportDialog open={showLoBImportDialog} onOpenChange={setShowLoBImportDialog} onSuccess={fetchRisks} />
        )}

        {showCrystallizedDialog && crystallizedRisk && (
          <ReportCrystallizedDialog open={showCrystallizedDialog} onOpenChange={setShowCrystallizedDialog} risk={crystallizedRisk} onSuccess={fetchRisks} />
        )}
      </div>
    </TooltipProvider>
  );
}
