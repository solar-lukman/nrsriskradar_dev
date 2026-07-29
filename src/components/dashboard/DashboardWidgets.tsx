import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, Shield, Users } from 'lucide-react';

interface Risk {
  id: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  created_at: string;
}

interface DashboardWidgetsProps {
  risks: Risk[];
}

export function DashboardWidgets({ risks }: DashboardWidgetsProps) {
  const openRisks = risks.filter(risk => risk.status !== 'Mitigated').length;
  const totalRisks = risks.length;
  const highRisks = risks.filter(risk => 
    (risk.inherent_likelihood * risk.inherent_impact) >= 15
  ).length;
  
  // Mock BCP coverage percentage (in real app, this would come from BCP module)
  const bcpCoverage = 85;

  const avgRiskScore = risks.length > 0 
    ? Math.round(risks.reduce((sum, risk) => 
        sum + (risk.residual_likelihood * risk.residual_impact), 0) / risks.length * 10) / 10
    : 0;

  const widgets = [
    {
      title: 'Open Risks',
      value: openRisks,
      subtitle: `${totalRisks} total risks`,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10'
    },
    {
      title: 'High Priority Risks',
      value: highRisks,
      subtitle: 'Score ≥ 15',
      icon: TrendingUp,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10'
    },
    {
      title: 'BCP Coverage',
      value: `${bcpCoverage}%`,
      subtitle: 'Business continuity',
      icon: Shield,
      color: 'text-success',
      bgColor: 'bg-success/10'
    },
    {
      title: 'Avg Risk Score',
      value: avgRiskScore,
      subtitle: 'Residual risk level',
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {widgets.map((widget, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {widget.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${widget.bgColor}`}>
              <widget.icon className={`w-4 h-4 ${widget.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{widget.value}</div>
            <p className="text-xs text-muted-foreground">
              {widget.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}