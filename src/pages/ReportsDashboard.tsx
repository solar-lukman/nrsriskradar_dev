import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, BarChart3, PieChart, TrendingUp, Brain, Grid3x3 } from 'lucide-react';
import { useRealtimeRisks } from '@/hooks/useRealtimeRisks';
import { EnhancedDashboardWidgets } from '@/components/dashboard/EnhancedDashboardWidgets';
import { AdvancedDashboardFilters } from '@/components/dashboard/AdvancedDashboardFilters';
import { RiskTrendChart } from '@/components/dashboard/RiskTrendChart';
import { RiskCategoryChart } from '@/components/dashboard/RiskCategoryChart';
import { InteractiveRiskTable } from '@/components/dashboard/InteractiveRiskTable';
import { ExportReportsMenu } from '@/components/dashboard/ExportReportsMenu';
import { AIReportGeneratorDialog } from '@/components/dashboard/AIReportGeneratorDialog';
import { RiskHeatmap } from '@/components/risk-matrix/RiskHeatmap';
import { TopRisksCard } from '@/components/dashboard/TopRisksCard';
import { StatusBreakdownCard } from '@/components/dashboard/StatusBreakdownCard';
import { MaturityTrendCard } from '@/components/dashboard/MaturityTrendCard';
import { AccessDenied } from '@/components/AccessDenied';

interface DashboardFilters {
  startDate?: Date;
  endDate?: Date;
  department?: string;
  owner?: string;
  search?: string;
  status?: string;
  severity?: string;
  overdue?: boolean;
}

type View = 'overview' | 'trends' | 'categories' | 'heatmap';
const VIEW_KEY = 'reports.activeView';

export default function ReportsDashboard() {
  const { user, hasPermission } = useAuth();
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [activeView, setActiveView] = useState<View>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem(VIEW_KEY) as View) : null;
    return saved && ['overview', 'trends', 'categories', 'heatmap'].includes(saved) ? saved : 'overview';
  });
  const [showReportGenerator, setShowReportGenerator] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, activeView); } catch {}
  }, [activeView]);

  const { risks, loading, error, refetch } = useRealtimeRisks({ filters });

  const handleFilterChange = useCallback((newFilters: DashboardFilters) => {
    setFilters(prev => ({ ...newFilters, overdue: prev.overdue }));
  }, []);


  const handleWidgetClick = (filter: { type: string; value: string }) => {
    setFilters(prev => {
      const next = { ...prev };
      switch (filter.type) {
        case 'status':
          next.status = filter.value;
          break;
        case 'severity':
          next.severity = filter.value;
          break;
        case 'overdue':
          next.overdue = filter.value === 'true' ? true : undefined;
          break;
      }
      return next;
    });
  };

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.startDate || filters.endDate || filters.department || filters.owner ||
        filters.search || filters.status || filters.severity || filters.overdue,
      ),
    [filters],
  );

  // Map risks to RiskHeatmap shape
  const heatmapRisks = useMemo(
    () => risks.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      department: r.department ?? '',
      owner: r.owner_id ?? '',
      category: r.category ?? '',
      inherentLikelihood: r.inherent_likelihood,
      inherentImpact: r.inherent_impact,
      residualLikelihood: r.residual_likelihood,
      residualImpact: r.residual_impact,
      status: r.status,
      lastReviewed: r.review_date ?? r.updated_at ?? r.created_at,
      mitigationActions: r.mitigation_plan ? [r.mitigation_plan] : [],
    })),
    [risks],
  );

  if (!user || !hasPermission('view_reports')) {
    return <AccessDenied message="This dashboard is only available to CRO, ERMSC, EC, and Risk Committee members." />;
  }

  if (error) {
    return (
      <Alert className="max-w-md mx-auto mt-8">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const viewOptions: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'categories', label: 'Categories', icon: PieChart },
    { id: 'heatmap', label: 'Heatmap', icon: Grid3x3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-header bg-clip-text text-transparent">
            Executive Dashboard
          </h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Real-time risk management overview</span>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {hasActiveFilters && (
              <Badge variant="outline" className="text-xs">
                Filtered: {risks.length} {risks.length === 1 ? 'risk' : 'risks'}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refetch} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowReportGenerator(true)} className="flex items-center gap-2">
            <Brain className="w-4 h-4" /> AI Report
          </Button>
          <ExportReportsMenu risks={risks} />
        </div>
      </div>

      {/* Collapsible Filters */}
      <AdvancedDashboardFilters onFilterChange={handleFilterChange} />

      {/* Metric cards (2 rows) */}
      <EnhancedDashboardWidgets risks={risks} onWidgetClick={handleWidgetClick} />

      {/* View Toggle */}
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">View:</span>
          <div className="flex gap-2 flex-wrap">
            {viewOptions.map(v => (
              <Button
                key={v.id}
                variant={activeView === v.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveView(v.id)}
                className="flex items-center gap-2"
              >
                <v.icon className="w-4 h-4" />
                {v.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Charts */}
      {activeView === 'overview' && (
        <>
          {/* Insight cards (filter-aware) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <TopRisksCard risks={risks} />
            <StatusBreakdownCard risks={risks} />
            <MaturityTrendCard risks={risks} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Risk Trend Analysis
              </CardTitle>
            </CardHeader>
            <CardContent><RiskTrendChart risks={risks} /></CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary" />
                Category Distribution
              </CardTitle>
            </CardHeader>
            <CardContent><RiskCategoryChart risks={risks} /></CardContent>
          </Card>
        </div>
        </>
      )}

      {activeView === 'trends' && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Detailed Risk Trends</CardTitle></CardHeader>
          <CardContent className="h-[500px]"><RiskTrendChart risks={risks} /></CardContent>
        </Card>
      )}

      {activeView === 'categories' && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Risk Category Analysis</CardTitle></CardHeader>
          <CardContent className="h-[500px]"><RiskCategoryChart risks={risks} /></CardContent>
        </Card>
      )}

      {activeView === 'heatmap' && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Residual Risk Heatmap</CardTitle></CardHeader>
          <CardContent>
            <RiskHeatmap risks={heatmapRisks} riskType="residual" />
          </CardContent>
        </Card>
      )}

      {/* Risk table with pagination */}
      <InteractiveRiskTable risks={risks} />

      <AIReportGeneratorDialog open={showReportGenerator} onOpenChange={setShowReportGenerator} />
    </div>
  );
}
