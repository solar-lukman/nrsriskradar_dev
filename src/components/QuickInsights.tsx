import React from 'react';
import { TrendingUp, AlertTriangle, Shield, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRisks } from '@/hooks/useRisks';
import { useBCPData } from '@/hooks/useBCPData';

export function QuickInsights() {
  const { risks, loading: risksLoading } = useRisks();
  const { bcpData, loading: bcpLoading } = useBCPData();

  if (risksLoading || bcpLoading) {
    return (
      <div className="p-4 border-t border-border">
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded animate-pulse" />
          <div className="h-4 bg-muted rounded animate-pulse" />
          <div className="h-4 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const totalRisks = risks?.length || 0;
  const highRisks = risks?.filter(risk => 
    (risk.inherentImpact * risk.inherentLikelihood) >= 15 || 
    (risk.residualImpact * risk.residualLikelihood) >= 12
  ).length || 0;
  
  const mitigatedRisks = risks?.filter(risk => risk.status === 'Mitigated').length || 0;
  const complianceScore = totalRisks > 0 ? Math.round((mitigatedRisks / totalRisks) * 100) : 0;

  const bcpReadiness = bcpData.coverage;

  const insights = [
    {
      label: 'Total Risks',
      value: totalRisks.toString(),
      icon: AlertTriangle,
      trend: totalRisks > 50 ? 'high' : totalRisks > 25 ? 'medium' : 'low'
    },
    {
      label: 'High Priority',
      value: highRisks.toString(),
      icon: TrendingUp,
      trend: highRisks > 5 ? 'high' : highRisks > 2 ? 'medium' : 'low'
    },
    {
      label: 'Risk Coverage',
      value: `${complianceScore}%`,
      icon: Shield,
      trend: complianceScore >= 90 ? 'low' : complianceScore >= 70 ? 'medium' : 'high'
    },
    {
      label: 'BCP Readiness',
      value: `${bcpReadiness}%`,
      icon: Clock,
      trend: bcpReadiness >= 85 ? 'low' : bcpReadiness >= 65 ? 'medium' : 'high'
    }
  ];

  return (
    <Card className="m-4 mt-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Quick Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, index) => (
          <div key={index} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <insight.icon className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{insight.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs">{insight.value}</span>
              <Badge 
                variant={
                  insight.trend === 'high' ? 'destructive' :
                  insight.trend === 'medium' ? 'secondary' : 'outline'
                }
                className="w-2 h-2 p-0 rounded-full"
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}