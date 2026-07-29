import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, AlertTriangle, Shield, Activity, Clock, RefreshCw,
  CheckCircle2, Inbox, Zap, Wallet,
} from 'lucide-react';
import { useBCPData } from '@/hooks/useBCPData';
import { useApprovalInboxCount } from '@/hooks/useApprovalInbox';
import { useBudgetForecast } from '@/hooks/useBudgetForecast';
import { supabase } from '@/integrations/supabase/client';
import { formatCompactNumber } from '@/lib/chartUtils';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface EnhancedDashboardWidgetsProps {
  risks: Risk[];
  onWidgetClick?: (filter: { type: string; value: string }) => void;
}

const OPEN_STATUSES = new Set(['New', 'In Review', 'Submitted', 'Escalated']);

export function EnhancedDashboardWidgets({ risks, onWidgetClick }: EnhancedDashboardWidgetsProps) {
  const { bcpData, loading: bcpLoading } = useBCPData();
  const { count: approvalCount } = useApprovalInboxCount();
  const { aggregateForecast, forecasts, loading: budgetLoading } = useBudgetForecast();
  const [crystallized90d, setCrystallized90d] = useState<number | null>(null);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    supabase
      .from('risk_events')
      .select('id', { count: 'exact', head: true })
      .gte('event_date', since.toISOString())
      .then(({ count }) => setCrystallized90d(count ?? 0));
  }, []);

  // Filtered risk metrics
  const totalRisks = risks.length;
  const openRisks = risks.filter(r => OPEN_STATUSES.has(r.status)).length;
  const highRisks = risks.filter(r => (r.inherent_likelihood * r.inherent_impact) >= 15).length;
  const overDueRisks = risks.filter(r => r.review_date && new Date(r.review_date) < new Date()).length;

  const avgInherent = totalRisks > 0
    ? risks.reduce((s, r) => s + (r.inherent_likelihood * r.inherent_impact), 0) / totalRisks
    : 0;
  const avgResidual = totalRisks > 0
    ? risks.reduce((s, r) => s + (r.residual_likelihood * r.residual_impact), 0) / totalRisks
    : 0;
  const mitigationEffectiveness = avgInherent > 0
    ? Math.max(0, Math.round(((avgInherent - avgResidual) / avgInherent) * 100))
    : 0;

  // Aggregate budget utilisation across active risks
  const avgBudgetUtil = forecasts.length > 0
    ? Math.round(forecasts.reduce((s, f) => s + f.currentUtilization, 0) / forecasts.length)
    : 0;
  const budgetColor = avgBudgetUtil >= 90 ? 'destructive' : avgBudgetUtil >= 75 ? 'warning' : 'success';

  const row1 = [
    {
      title: 'Total Risks',
      value: totalRisks,
      subtitle: 'In current view',
      icon: Activity,
      tone: 'primary' as const,
      clickable: false,
    },
    {
      title: 'High Severity',
      value: highRisks,
      subtitle: 'Score ≥ 15',
      icon: AlertTriangle,
      tone: highRisks > 0 ? ('destructive' as const) : ('muted' as const),
      clickable: true,
      filter: { type: 'severity', value: 'high' },
      badge: highRisks > 0 ? 'High' : undefined,
    },
    {
      title: 'Open / In Progress',
      value: openRisks,
      subtitle: `${totalRisks > 0 ? Math.round((openRisks / totalRisks) * 100) : 0}% of total`,
      icon: Inbox,
      tone: openRisks > 0 ? ('warning' as const) : ('success' as const),
      clickable: false,
    },
    {
      title: 'Mitigation Effectiveness',
      value: `${mitigationEffectiveness}%`,
      subtitle: `Avg residual ${avgResidual.toFixed(1)} vs inherent ${avgInherent.toFixed(1)}`,
      icon: CheckCircle2,
      tone: mitigationEffectiveness >= 50 ? ('success' as const) : mitigationEffectiveness >= 25 ? ('warning' as const) : ('destructive' as const),
      clickable: false,
    },
    {
      title: 'Overdue Reviews',
      value: overDueRisks,
      subtitle: 'Past review date',
      icon: Clock,
      tone: overDueRisks > 0 ? ('destructive' as const) : ('success' as const),
      clickable: true,
      filter: { type: 'overdue', value: 'true' },
    },
  ];

  const row2 = [
    {
      title: 'BCP Coverage',
      value: bcpLoading ? '…' : `${bcpData.coverage}%`,
      subtitle: `${bcpData.readyPlans}/${bcpData.totalPlans} ready`,
      icon: Shield,
      tone: bcpData.coverage >= 80 ? ('success' as const) : bcpData.coverage >= 60 ? ('warning' as const) : ('destructive' as const),
      clickable: false,
    },
    {
      title: 'Pending Approvals',
      value: approvalCount,
      subtitle: 'Awaiting your action',
      icon: Zap,
      tone: approvalCount > 0 ? ('warning' as const) : ('muted' as const),
      clickable: false,
    },
    {
      title: 'Crystallized (90d)',
      value: crystallized90d ?? '…',
      subtitle: 'Risk events recorded',
      icon: TrendingUp,
      tone: (crystallized90d ?? 0) > 0 ? ('destructive' as const) : ('success' as const),
      clickable: false,
    },
    {
      title: 'Budget Utilisation',
      value: budgetLoading ? '…' : `${avgBudgetUtil}%`,
      subtitle: aggregateForecast?.projectedBudgetDepletionDate
        ? `Depletion: ${new Date(aggregateForecast.projectedBudgetDepletionDate).toLocaleDateString()}`
        : 'Across active risks',
      icon: Wallet,
      tone: budgetColor as 'success' | 'warning' | 'destructive',
      clickable: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {row1.map((w, i) => <MetricCard key={`r1-${i}`} {...w} onWidgetClick={onWidgetClick} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {row2.map((w, i) => <MetricCard key={`r2-${i}`} {...w} onWidgetClick={onWidgetClick} />)}
      </div>
    </div>
  );
}

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  clickable?: boolean;
  filter?: { type: string; value: string };
  badge?: string;
  onWidgetClick?: (f: { type: string; value: string }) => void;
}

function MetricCard({ title, value, subtitle, icon: Icon, tone, clickable, filter, badge, onWidgetClick }: MetricCardProps) {
  const toneClasses: Record<Tone, { color: string; bg: string }> = {
    primary: { color: 'text-primary', bg: 'bg-primary/10' },
    success: { color: 'text-success', bg: 'bg-success/10' },
    warning: { color: 'text-warning', bg: 'bg-warning/10' },
    destructive: { color: 'text-destructive', bg: 'bg-destructive/10' },
    muted: { color: 'text-muted-foreground', bg: 'bg-muted/30' },
  };
  const t = toneClasses[tone];

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-card ${
        clickable ? 'cursor-pointer hover:scale-[1.02] focus-within:ring-2 focus-within:ring-ring' : ''
      }`}
      onClick={() => clickable && filter && onWidgetClick?.(filter)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && filter && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onWidgetClick?.(filter);
        }
      }}
      aria-label={clickable ? `${title}: ${value}. Click to filter.` : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${t.bg} transition-colors`}>
          <Icon className={`w-4 h-4 ${t.color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold tabular-nums">
            {typeof value === 'number' ? formatCompactNumber(value) : value}
          </div>
          {badge && <Badge variant="destructive" className="text-xs">{badge}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
