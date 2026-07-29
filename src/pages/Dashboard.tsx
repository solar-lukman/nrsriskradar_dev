import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BudgetDashboardWidget } from '@/components/dashboard/BudgetDashboardWidget';
import { AppetiteIndicatorWidget } from '@/components/dashboard/AppetiteIndicatorWidget';
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Plus,
  BarChart3,
  BookOpen,
  FileText,
  Activity,
  Calendar,
  Target,
  ArrowRight,
  Brain,
  FolderLock
} from 'lucide-react';
import { PredictiveRiskPanel } from '@/components/ai/PredictiveRiskPanel';
import { AIRiskScoreCard } from '@/components/ai/AIRiskScoreCard';
import { useNavigate } from 'react-router-dom';
import { useBCPData } from '@/hooks/useBCPData';

interface Risk {
  id: string;
  title: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  created_at: string;
}

export function Dashboard() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const { bcpData } = useBCPData();

  useEffect(() => {
    console.log('Dashboard useEffect - user:', user);
    console.log('Dashboard useEffect - user role:', user?.role);
    console.log('Dashboard useEffect - hasPermission(view_dashboard):', hasPermission('view_dashboard'));
    
    if (user && hasPermission('view_dashboard')) {
      fetchRisks();
    } else if (user && !hasPermission('view_dashboard')) {
      console.log('User authenticated but no access to dashboard');
      setLoading(false);
    } else {
      console.log('User not authenticated yet');
    }
  }, [user, hasPermission]);

  const fetchRisks = async () => {
    try {
      console.log('Dashboard fetching risks...');
      
      if (!user) {
        console.log('No user authenticated, skipping risk fetch');
        setRisks([]);
        return;
      }

      if (!hasPermission('view_dashboard')) {
        console.log('User has no dashboard access, skipping fetch');
        setRisks([]);
        return;
      }

      const { data, error } = await supabase
        .from('risks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Dashboard risk fetch error:', error);
        if (error.message.includes('infinite recursion')) {
          throw new Error('Database configuration error. Please contact administrator.');
        }
        throw error;
      }
      
      console.log('Dashboard risks fetched successfully:', data?.length || 0);
      setRisks(data || []);
    } catch (error: any) {
      console.error('Error fetching dashboard risks:', error);
      setRisks([]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
          <p className="text-xs text-muted-foreground">If this takes too long, please refresh the page</p>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const totalRisks = risks.length;
  const highRisks = risks.filter(risk => 
    (risk.inherent_likelihood * risk.inherent_impact) >= 15
  ).length;
  const openRisks = risks.filter(risk => risk.status !== 'Mitigated').length;
  const avgRiskScore = totalRisks > 0 
    ? Math.round(risks.reduce((sum, risk) => 
        sum + (risk.residual_likelihood * risk.residual_impact), 0) / totalRisks * 10) / 10
    : 0;

  const quickActions = [
    {
      label: 'Add New Risk',
      icon: Plus,
      description: 'Register a new risk',
      action: () => navigate('/risk-register'),
      variant: 'default' as const,
      show: hasPermission('add_risk')
    },
    {
      label: 'View Risk Matrix',
      icon: BarChart3,
      description: 'Analyze risk heatmaps',
      action: () => navigate('/risk-matrix'),
      variant: 'outline' as const,
      show: hasPermission('view_reports')
    },
    {
      label: 'Reports Dashboard',
      icon: FileText,
      description: 'Executive analytics',
      action: () => navigate('/reports'),
      variant: 'outline' as const,
      show: hasPermission('view_reports')
    },
    {
      label: 'Control Documents',
      icon: FolderLock,
      description: 'Policies & procedures',
      action: () => navigate('/control-documents'),
      variant: 'outline' as const,
      show: true
    },
    {
      label: 'Learning Forum',
      icon: BookOpen,
      description: 'Training & knowledge',
      action: () => navigate('/learning-forum'),
      variant: 'ghost' as const,
      show: true
    }
  ].filter(action => action.show);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary via-primary-dark to-primary-darker text-primary-foreground">
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center justify-between">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight">
                Welcome back, {user.name}
              </h1>
               <p className="text-xl text-primary-foreground/80">
                 {user.role === 'ADMIN' ? 'System Administrator' : 
                  user.role === 'CRO' ? 'Chief Risk Officer' :
                  user.role === 'RMD' ? 'Risk Management Department' :
                  user.role === 'RC' ? 'Risk Champion' :
                  'Risk Management Portal'} • {user.department || 'General'}
               </p>
              <div className="flex items-center space-x-2 text-primary-foreground/70">
                <Calendar className="w-4 h-4" />
                <span>{new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  <Shield className="w-12 h-12 text-primary-foreground" />
                  <div>
                    <div className="text-2xl font-bold">{openRisks}</div>
                    <div className="text-sm text-primary-foreground/80">Active Risks</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card 
            className="border-l-4 border-l-destructive cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/risk-register?filter=high-priority')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Priority Risks</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{highRisks}</div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Require immediate attention</p>
                <span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="border-l-4 border-l-warning cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/risk-register?filter=open')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Risks</CardTitle>
              <Target className="w-4 h-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{openRisks}</div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Out of {totalRisks} total</p>
                <span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Risk Score</CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgRiskScore}</div>
              <p className="text-xs text-muted-foreground">Residual risk level</p>
            </CardContent>
          </Card>

          <Card 
            className="border-l-4 border-l-success cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/business-continuity')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">BCP Coverage</CardTitle>
              <Shield className="w-4 h-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{bcpData.coverage}%</div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{bcpData.readyPlans} of {bcpData.totalPlans} plans ready</p>
                <span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant}
                className="h-auto p-6 flex flex-col items-start text-left space-y-2"
                onClick={action.action}
              >
                <action.icon className="w-6 h-6" />
                <div className="font-semibold">{action.label}</div>
                <div className="text-xs opacity-80">{action.description}</div>
              </Button>
            ))}
          </div>
        </div>

        {/* Budget Utilization Widget */}
        {hasPermission('view_reports') && (
          <BudgetDashboardWidget />
        )}

        {/* Risk Appetite Indicator */}
        {hasPermission('view_reports') && (
          <AppetiteIndicatorWidget />
        )}

        {/* AI Insights Section */}
        {hasPermission('view_reports') && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">AI Insights</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PredictiveRiskPanel />
              <AIRiskScoreCard />
            </div>
          </div>
        )}

        {/* Recent Risks & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Risks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Recent Risks
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/risk-register')}
              >
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : risks.length > 0 ? (
                <div className="space-y-4">
                  {risks.slice(0, 5).map((risk) => (
                    <div key={risk.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                      <div className="flex-1">
                        <div className="font-medium truncate">{risk.title || 'Untitled Risk'}</div>
                        <div className="text-sm text-muted-foreground">
                          {risk.created_at ? new Date(risk.created_at).toLocaleDateString() : 'Unknown date'}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant={
                            (risk.inherent_likelihood * risk.inherent_impact) >= 15 ? 'destructive' :
                            (risk.inherent_likelihood * risk.inherent_impact) >= 10 ? 'default' : 'secondary'
                          }
                        >
                          {risk.inherent_likelihood * risk.inherent_impact}
                        </Badge>
                        <Badge variant="outline">
                          {risk.status || 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No risks found</p>
                  {hasPermission('add_risk') && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => navigate('/risk-register')}
                    >
                      Add First Risk
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Risk Assessment Coverage</span>
                  <span className="font-medium">92%</span>
                </div>
                <Progress value={92} className="h-2" />
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>BCP Testing Status</span>
                  <span className="font-medium">75%</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Document Compliance</span>
                  <span className="font-medium">88%</span>
                </div>
                <Progress value={88} className="h-2" />
              </div>

              <div className="pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Last updated: {new Date().toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}