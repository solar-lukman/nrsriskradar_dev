import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  TrendingDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useBudgetForecast } from '@/hooks/useBudgetForecast';

type Risk = Tables<'risks'>;

interface DepartmentBudget {
  department: string;
  totalBudget: number;
  totalSpent: number;
  utilization: number;
  riskCount: number;
}

export function BudgetDashboardWidget() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const { forecasts, aggregateForecast, loading: forecastLoading } = useBudgetForecast();

  useEffect(() => {
    fetchBudgetData();
  }, []);

  const fetchBudgetData = async () => {
    try {
      const { data, error } = await supabase
        .from('risks')
        .select('*')
        .not('mitigation_budget', 'is', null)
        .in('status', ['New', 'In Review', 'Escalated']); // Active risks only

      if (error) throw error;
      setRisks(data || []);
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate aggregate metrics
  const totalBudget = risks.reduce((sum, risk) => 
    sum + (Number(risk.mitigation_budget) || 0), 0);
  const totalSpent = risks.reduce((sum, risk) => 
    sum + (Number(risk.mitigation_budget_spent) || 0), 0);
  const overallUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Calculate department breakdown
  const departmentData: DepartmentBudget[] = Object.values(
    risks.reduce((acc, risk) => {
      const dept = risk.department || 'Unassigned';
      if (!acc[dept]) {
        acc[dept] = {
          department: dept,
          totalBudget: 0,
          totalSpent: 0,
          utilization: 0,
          riskCount: 0
        };
      }
      acc[dept].totalBudget += Number(risk.mitigation_budget) || 0;
      acc[dept].totalSpent += Number(risk.mitigation_budget_spent) || 0;
      acc[dept].riskCount += 1;
      return acc;
    }, {} as Record<string, DepartmentBudget>)
  ).map(dept => ({
    ...dept,
    utilization: dept.totalBudget > 0 ? (dept.totalSpent / dept.totalBudget) * 100 : 0
  })).sort((a, b) => b.utilization - a.utilization);

  const getUtilizationColor = (utilization: number) => {
    if (utilization > 90) return 'text-destructive';
    if (utilization > 75) return 'text-warning';
    return 'text-success';
  };

  const getProgressBarColor = (utilization: number) => {
    if (utilization > 90) return '[&>div]:bg-destructive';
    if (utilization > 75) return '[&>div]:bg-warning';
    return '[&>div]:bg-success';
  };

  const getStatusBadge = (utilization: number) => {
    if (utilization > 90) return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    if (utilization > 75) return <Badge variant="outline" className="text-xs border-warning text-warning">Warning</Badge>;
    return <Badge variant="outline" className="text-xs border-success text-success">Healthy</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Budget Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-full"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (risks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Budget Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">No budget data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Budget Utilization
          </div>
          {getStatusBadge(overallUtilization)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Budget Summary */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-bold">
                NGN {totalSpent.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                of NGN {totalBudget.toLocaleString()} allocated
              </div>
            </div>
            <div className={`text-3xl font-bold ${getUtilizationColor(overallUtilization)}`}>
              {overallUtilization.toFixed(1)}%
            </div>
          </div>
          
          <Progress 
            value={overallUtilization} 
            className={`h-3 ${getProgressBarColor(overallUtilization)}`}
          />
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{risks.length} active risks with budgets</span>
            <span>NGN {(totalBudget - totalSpent).toLocaleString()} remaining</span>
          </div>

          {overallUtilization > 75 && (
            <div className={`flex items-start gap-2 p-3 rounded-lg ${
              overallUtilization > 90 ? 'bg-destructive/10' : 'bg-warning/10'
            }`}>
              <AlertCircle className={`w-4 h-4 mt-0.5 ${getUtilizationColor(overallUtilization)}`} />
              <div className="text-sm">
                <div className={`font-medium ${getUtilizationColor(overallUtilization)}`}>
                  {overallUtilization > 90 ? 'Critical Budget Alert' : 'Budget Warning'}
                </div>
                <div className="text-muted-foreground">
                  {overallUtilization > 90 
                    ? 'Budget utilization exceeds 90%. Immediate review required.'
                    : 'Budget utilization exceeds 75%. Monitor closely.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Budget Forecast Analytics */}
        {!forecastLoading && aggregateForecast && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="w-4 h-4" />
              Budget Forecast
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Daily Spend Rate</div>
                <div className="text-lg font-bold">
                  NGN {aggregateForecast.overallDailySpendRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Avg. Days to Depletion</div>
                <div className="text-lg font-bold">
                  {aggregateForecast.averageDaysToDepletion 
                    ? `${Math.round(aggregateForecast.averageDaysToDepletion)}d`
                    : 'N/A'}
                </div>
              </div>
            </div>

            {aggregateForecast.projectedBudgetDepletionDate && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Calendar className="w-4 h-4 mt-0.5 text-primary" />
                <div className="text-sm flex-1">
                  <div className="font-medium text-primary">Projected Budget Depletion</div>
                  <div className="text-muted-foreground">
                    {aggregateForecast.projectedBudgetDepletionDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            )}

            {(aggregateForecast.risksExceeding75Soon > 0 || aggregateForecast.risksExceeding90Soon > 0) && (
              <div className="space-y-2">
                {aggregateForecast.risksExceeding90Soon > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-destructive/10 text-sm">
                    <span className="text-destructive font-medium">
                      {aggregateForecast.risksExceeding90Soon} {aggregateForecast.risksExceeding90Soon === 1 ? 'risk' : 'risks'} reaching 90% within 30 days
                    </span>
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </div>
                )}
                {aggregateForecast.risksExceeding75Soon > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-warning/10 text-sm">
                    <span className="text-warning font-medium">
                      {aggregateForecast.risksExceeding75Soon} {aggregateForecast.risksExceeding75Soon === 1 ? 'risk' : 'risks'} reaching 75% within 60 days
                    </span>
                    <TrendingDown className="w-4 h-4 text-warning" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Department Breakdown */}
        <div className="border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full flex items-center justify-between mb-3"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="font-medium">Department Breakdown</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>

          {expanded && (
            <div className="space-y-4">
              {departmentData.map((dept) => (
                <div key={dept.department} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{dept.department}</span>
                      <span className="text-xs text-muted-foreground">
                        ({dept.riskCount} {dept.riskCount === 1 ? 'risk' : 'risks'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${getUtilizationColor(dept.utilization)}`}>
                        {dept.utilization.toFixed(1)}%
                      </span>
                      {dept.utilization > 90 && (
                        <Badge variant="destructive" className="text-xs">!</Badge>
                      )}
                    </div>
                  </div>
                  <Progress 
                    value={dept.utilization} 
                    className={`h-2 ${getProgressBarColor(dept.utilization)}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>NGN {dept.totalSpent.toLocaleString()} spent</span>
                    <span>NGN {dept.totalBudget.toLocaleString()} budget</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
