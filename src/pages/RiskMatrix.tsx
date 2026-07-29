import React, { useState, useMemo } from 'react';
import { 
  Download, 
  Filter, 
  Search, 
  ToggleLeft, 
  ToggleRight,
  Grid3X3,
  TrendingUp,
  AlertTriangle,
  Target,
  Users,
  Building,
  Loader2,
  Plus,
  Edit,
  History,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RiskHeatmap } from '@/components/risk-matrix/RiskHeatmap';
import { RiskFilters } from '@/components/risk-matrix/RiskFilters';
import { ExportMenu } from '@/components/risk-matrix/ExportMenu';
import { ViewRiskDialog } from '@/components/risk-register/ViewRiskDialog';
import { RiskWizardDialog } from '@/components/risk-register/RiskWizardDialog';
import { AuditLogDialog } from '@/components/risk-register/AuditLogDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useRisks } from '@/hooks/useRisks';
import { useMatrixDimensions } from '@/hooks/useMatrixDimensions';
import { useRiskCategories } from '@/hooks/useRiskCategories';

export default function RiskMatrix() {
  const { user, hasPermission } = useAuth();
  const { risks, loading, error, refetch } = useRisks();
  const { sizeFor } = useMatrixDimensions();
  // Primary tab: Institutional vs Compliance risk type
  const [activeRiskType, setActiveRiskType] = useState<'institutional' | 'compliance'>('institutional');
  // Secondary scoring view: inherent vs residual (used for heatmap math)
  const [riskType, setRiskType] = useState<'inherent' | 'residual'>('inherent');
  const [filters, setFilters] = useState({
    department: 'all',
    owner: 'all',
    category: 'all',
    status: 'all',
    search: '',
    riskType: 'all',
  });
  const [selectedRisk, setSelectedRisk] = useState<any>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);

  // Role gating: only allowed roles can view the matrix
  const canViewMatrix = hasPermission('view_risks');

  // Only approved risks are shown on the matrix preview, scoped to the active risk type
  const approvedRisks = useMemo(
    () => risks.filter(r => r.approvalStatus === 'Approved' && r.riskType === activeRiskType),
    [risks, activeRiskType]
  );

  // Filter approved risks based on current filters
  const filteredRisks = useMemo(() => {
    return approvedRisks.filter(risk => {
      const matchesDepartment = filters.department === 'all' || !filters.department || risk.department === filters.department;
      const matchesOwner = filters.owner === 'all' || !filters.owner || risk.owner === filters.owner;
      const matchesCategory = filters.category === 'all' || !filters.category || risk.category === filters.category;
      const matchesStatus = filters.status === 'all' || !filters.status || risk.status === filters.status;
      const matchesRiskType = filters.riskType === 'all' || risk.riskType === filters.riskType;
      const matchesSearch = !filters.search ||
        risk.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        risk.description.toLowerCase().includes(filters.search.toLowerCase());

      return matchesDepartment && matchesOwner && matchesCategory && matchesStatus && matchesRiskType && matchesSearch;
    });
  }, [approvedRisks, filters]);

  // Calculate risk statistics
  const riskStats = useMemo(() => {
    const stats = {
      total: filteredRisks.length,
      high: 0,
      medium: 0,
      low: 0,
      critical: 0,
    };

    filteredRisks.forEach(risk => {
      const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
      const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
      const riskScore = likelihood * impact;

      if (riskScore >= 20) stats.critical++;
      else if (riskScore >= 15) stats.high++;
      else if (riskScore >= 8) stats.medium++;
      else stats.low++;
    });

    return stats;
  }, [filteredRisks, riskType]);

  // Get unique values for filter dropdowns
  const { categories: categoryRows } = useRiskCategories({ riskType: activeRiskType });
  const departments = [...new Set(approvedRisks.map(r => r.department).filter(Boolean))] as string[];
  const owners = [...new Set(approvedRisks.map(r => r.owner).filter(Boolean))] as string[];
  const categories = categoryRows.length > 0
    ? categoryRows.map(c => c.name)
    : [...new Set(approvedRisks.map(r => r.category).filter(Boolean))] as string[];
  const statuses = [...new Set(approvedRisks.map(r => r.status).filter(Boolean))] as string[];

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      department: 'all',
      owner: 'all',
      category: 'all',
      status: 'all',
      search: '',
      riskType: 'all',
    });
  };

  const handleRiskClick = (risk: any) => {
    setSelectedRisk(risk);
    setShowViewDialog(true);
  };

  const handleEditClick = (risk: any) => {
    setSelectedRisk(risk);
    setShowEditDialog(true);
  };

  const handleAuditClick = (risk: any) => {
    setSelectedRisk(risk);
    setShowAuditDialog(true);
  };

  const handleDialogSuccess = () => {
    refetch();
  };

  const canManageRisks = hasPermission('edit_risks') || hasPermission('add_risk');

  if (!user) return null;

  if (!canViewMatrix) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            You do not have permission to view the Risk Matrix. Please contact an administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading risks...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          Error loading risks: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">Risk Matrix</h1>
              <Badge variant="secondary" className="font-mono">
                {sizeFor(activeRiskType)}×{sizeFor(activeRiskType)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Heatmap of <strong>approved</strong> {activeRiskType} risks ({approvedRisks.length} approved)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {canManageRisks && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Risk
              </Button>
            )}
            <ExportMenu risks={filteredRisks} riskType={riskType} />
          </div>
        </div>

        {/* Risk Type Tabs - Institutional vs Compliance */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-1">
            <Button
              variant={activeRiskType === 'institutional' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveRiskType('institutional')}
              className="rounded-md"
            >
              <Building className="w-4 h-4 mr-2" />
              Institutional Risk
            </Button>
            <Button
              variant={activeRiskType === 'compliance' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveRiskType('compliance')}
              className="rounded-md"
            >
              <Target className="w-4 h-4 mr-2" />
              Compliance Risk
            </Button>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search risks..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Risks</p>
                  <p className="text-2xl font-bold">{riskStats.total}</p>
                </div>
                <Grid3X3 className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-2xl font-bold text-destructive">{riskStats.critical}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High</p>
                  <p className="text-2xl font-bold text-warning">{riskStats.high}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Medium</p>
                  <p className="text-2xl font-bold text-primary">{riskStats.medium}</p>
                </div>
                <Users className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low</p>
                  <p className="text-2xl font-bold text-success">{riskStats.low}</p>
                </div>
                <Building className="w-8 h-8 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Panel */}
          <div className="lg:col-span-1">
            <RiskFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearFilters={clearFilters}
              departments={departments}
              owners={owners}
              categories={categories}
              statuses={statuses}
            />
          </div>

          {/* Heatmap */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      <Grid3X3 className="w-5 h-5" />
                      <span>{activeRiskType === 'institutional' ? 'Institutional' : 'Compliance'} Risk Heatmap</span>
                      <Badge variant="outline" className="font-mono">
                        {sizeFor(activeRiskType)}×{sizeFor(activeRiskType)} matrix
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Interactive {sizeFor(activeRiskType)}×{sizeFor(activeRiskType)} matrix showing {activeRiskType} risks by likelihood and impact
                    </CardDescription>
                  </div>
                  {/* Scoring view toggle (inherent vs residual) */}
                  <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5 self-start">
                    <Button
                      variant={riskType === 'inherent' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setRiskType('inherent')}
                      className="h-7 px-2 text-xs"
                    >
                      Inherent
                    </Button>
                    <Button
                      variant={riskType === 'residual' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setRiskType('residual')}
                      className="h-7 px-2 text-xs"
                    >
                      Residual
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RiskHeatmap
                  risks={filteredRisks}
                  riskType={riskType}
                  dimensions={sizeFor(activeRiskType)}
                  onRiskClick={handleRiskClick}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Risk List */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Details</CardTitle>
            <CardDescription>
              Detailed view of filtered risks ({filteredRisks.length} of {risks.length} risks shown)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredRisks.map((risk) => {
                const likelihood = riskType === 'inherent' ? risk.inherentLikelihood : risk.residualLikelihood;
                const impact = riskType === 'inherent' ? risk.inherentImpact : risk.residualImpact;
                const riskScore = likelihood * impact;
                
                let riskLevel = 'Low';
                let riskColor = 'success';
                if (riskScore >= 20) { riskLevel = 'Critical'; riskColor = 'destructive'; }
                else if (riskScore >= 15) { riskLevel = 'High'; riskColor = 'warning'; }
                else if (riskScore >= 8) { riskLevel = 'Medium'; riskColor = 'primary'; }

                return (
                  <div 
                    key={risk.id} 
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-all cursor-pointer group"
                    onClick={() => handleRiskClick(risk)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-semibold">{risk.title}</h3>
                          <Badge variant={riskColor as any}>{riskLevel}</Badge>
                          <Badge variant="outline">{risk.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{risk.description}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Department:</span>
                            <br />
                            <span className="font-medium">{risk.department}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Owner:</span>
                            <br />
                            <span className="font-medium">{risk.owner}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Likelihood:</span>
                            <br />
                            <span className="font-medium">{likelihood}/5</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Impact:</span>
                            <br />
                            <span className="font-medium">{impact}/5</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right mr-4">
                          <div className="text-2xl font-bold mb-1">{riskScore}</div>
                          <div className="text-xs text-muted-foreground">Risk Score</div>
                        </div>
                        <div className="flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRiskClick(risk);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canManageRisks && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(risk);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAuditClick(risk);
                            }}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {filteredRisks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No risks match the current filters.</p>
                  <Button variant="outline" onClick={clearFilters} className="mt-2">
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dialogs */}
        {selectedRisk && (
          <>
            <ViewRiskDialog
              open={showViewDialog}
              onOpenChange={setShowViewDialog}
              risk={selectedRisk}
            />
            {canManageRisks && (
              <RiskWizardDialog
                open={showEditDialog}
                onOpenChange={setShowEditDialog}
                risk={selectedRisk}
                onSuccess={handleDialogSuccess}
              />
            )}
            <AuditLogDialog
              open={showAuditDialog}
              onOpenChange={setShowAuditDialog}
              riskId={selectedRisk.id}
            />
          </>
        )}
        <RiskWizardDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={handleDialogSuccess}
        />
      </div>
    </TooltipProvider>
  );
}