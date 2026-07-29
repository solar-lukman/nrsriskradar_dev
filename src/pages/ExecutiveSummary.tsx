import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, AlertTriangle, Shield, Activity, Clock,
  Flame, ArrowRight, CheckCircle2, Siren, Building2, Info, RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRisks } from '@/hooks/useRealtimeRisks';
import { useBCPData } from '@/hooks/useBCPData';
import { supabase } from '@/integrations/supabase/client';
import { TopRisksCard } from '@/components/dashboard/TopRisksCard';
import { StatusBreakdownCard } from '@/components/dashboard/StatusBreakdownCard';
import { RiskCategoryChart } from '@/components/dashboard/RiskCategoryChart';
import { ExportReportsMenu } from '@/components/dashboard/ExportReportsMenu';
import { AccessDenied } from '@/components/AccessDenied';

type Period = '30d' | '90d' | 'ytd' | 'all';
type RefreshInterval = 'off' | '30s' | '60s' | '5m';

const PERIOD_LABEL: Record<Period, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  all: 'All time',
};

const REFRESH_MS: Record<RefreshInterval, number> = {
  off: 0, '30s': 30_000, '60s': 60_000, '5m': 300_000,
};

function periodToStart(p: Period): Date | undefined {
  const now = new Date();
  if (p === '30d') return new Date(now.getTime() - 30 * 86400_000);
  if (p === '90d') return new Date(now.getTime() - 90 * 86400_000);
  if (p === 'ytd') return new Date(now.getFullYear(), 0, 1);
  return undefined;
}

const score = (l?: number | null, i?: number | null) => (l ?? 0) * (i ?? 0);
const residual = (r: any) => score(r.residual_likelihood, r.residual_impact);
const inherent = (r: any) => score(r.inherent_likelihood, r.inherent_impact);

export default function ExecutiveSummary() {
  const { user, hasPermission } = useAuth();
  const [period, setPeriod] = useState<Period>('90d');
  const [openIncidents, setOpenIncidents] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<RefreshInterval>('60s');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const startDate = useMemo(() => periodToStart(period), [period]);
  const { risks, loading, refetch } = useRealtimeRisks({ filters: { startDate } });
  const { bcpData, loading: bcpLoading } = useBCPData();

  const periodLabel = PERIOD_LABEL[period];
  const periodSuffix = period === 'all' ? '' : ` (${periodLabel.toLowerCase()})`;

  const fetchIncidents = useCallback(async () => {
    const { count } = await supabase
      .from('risk_events')
      .select('*', { head: true, count: 'exact' })
      .neq('status', 'closed')
      .neq('status', 'resolved');
    setOpenIncidents(count ?? 0);
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents, period]);

  const refreshAll = useCallback(() => {
    refetch();
    fetchIncidents();
    setLastRefreshed(new Date());
  }, [refetch, fetchIncidents]);

  // Auto-refresh interval
  useEffect(() => {
    const ms = REFRESH_MS[autoRefresh];
    if (!ms) return;
    const id = setInterval(refreshAll, ms);
    return () => clearInterval(id);
  }, [autoRefresh, refreshAll]);

  const kpis = useMemo(() => {
    const total = risks.length;
    const high = risks.filter(r => residual(r) >= 15).length;
    const mitigated = risks.filter(r => r.status === 'Mitigated').length;
    const today = Date.now();
    const overdue = risks.filter(
      r => r.review_date && new Date(r.review_date).getTime() < today,
    ).length;
    const mitigatedPct = total ? Math.round((mitigated / total) * 100) : 0;
    const avgResidual = total
      ? Math.round((risks.reduce((s, r) => s + residual(r), 0) / total) * 10) / 10
      : 0;
    return { total, high, mitigated, mitigatedPct, overdue, avgResidual };
  }, [risks]);

  const insights = useMemo(() => {
    if (!risks.length) return null;
    const byCat: Record<string, { drop: number; n: number }> = {};
    for (const r of risks) {
      const cat = r.category || 'Uncategorized';
      const drop = inherent(r) - residual(r);
      if (!byCat[cat]) byCat[cat] = { drop: 0, n: 0 };
      byCat[cat].drop += drop;
      byCat[cat].n += 1;
    }
    const positive = Object.entries(byCat)
      .filter(([, v]) => v.drop > 0)
      .sort((a, b) => b[1].drop - a[1].drop)[0];

    const deptHigh: Record<string, number> = {};
    for (const r of risks) {
      if (residual(r) >= 12) {
        const d = r.department || 'Unassigned';
        deptHigh[d] = (deptHigh[d] || 0) + 1;
      }
    }
    const attention = Object.entries(deptHigh).sort((a, b) => b[1] - a[1])[0];

    const today = Date.now();
    const critical = risks
      .filter(
        r =>
          (residual(r) >= 15 &&
            r.review_date &&
            new Date(r.review_date).getTime() < today) ||
          r.status === 'Escalated',
      )
      .sort((a, b) => residual(b) - residual(a))
      .slice(0, 3);

    return { positive, attention, critical };
  }, [risks]);

  if (!user || !hasPermission('strategic_overview')) {
    return <AccessDenied message="Executive Summary is restricted to CRO, ERMSC, EC, RCB and Risk Management roles." />;
  }

  const lastRefreshedLabel = lastRefreshed.toLocaleTimeString();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-header bg-clip-text text-transparent">
              Executive Summary
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span>Strategic risk posture as of {new Date().toLocaleDateString()}</span>
              <Badge variant="outline" className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Live
              </Badge>
              <span className="text-xs">· Updated {lastRefreshedLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card">
              <Label htmlFor="auto-refresh-toggle" className="text-xs cursor-pointer flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${autoRefresh !== 'off' ? 'text-primary' : 'text-muted-foreground'}`} />
                Auto
              </Label>
              <Switch
                id="auto-refresh-toggle"
                checked={autoRefresh !== 'off'}
                onCheckedChange={(v) => setAutoRefresh(v ? '60s' : 'off')}
              />
              <Select value={autoRefresh} onValueChange={(v) => setAutoRefresh(v as RefreshInterval)}>
                <SelectTrigger className="h-7 w-[80px] text-xs border-0 px-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="30s">30s</SelectItem>
                  <SelectItem value="60s">60s</SelectItem>
                  <SelectItem value="5m">5 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll} title="Refresh now">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['30d', '90d', 'ytd', 'all'] as Period[]).map(p => (
                  <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportReportsMenu risks={risks} />
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <KpiTile
            label="Total Risks"
            value={kpis.total}
            icon={Shield}
            loading={loading}
            hint={periodLabel}
            href="/risk-register"
            calc={`Count of all risks created within ${periodLabel.toLowerCase()}.`}
          />
          <KpiTile
            label="High Severity"
            value={kpis.high}
            icon={Flame}
            tone="destructive"
            loading={loading}
            hint="Residual ≥ 15"
            href="/risk-register?filter=high-priority"
            calc={`Risks where residual_likelihood × residual_impact ≥ 15${periodSuffix}.`}
          />
          <KpiTile
            label="Mitigated"
            value={`${kpis.mitigatedPct}%`}
            icon={CheckCircle2}
            tone="success"
            loading={loading}
            hint={`${kpis.mitigated} of ${kpis.total}`}
            href="/risk-register?filter=mitigated"
            calc={`Share of risks with status = "Mitigated" out of all risks${periodSuffix}.`}
          />
          <KpiTile
            label="Overdue Reviews"
            value={kpis.overdue}
            icon={Clock}
            tone={kpis.overdue > 0 ? 'warning' : 'success'}
            loading={loading}
            hint="Past review_date"
            href="/risk-register?filter=overdue"
            calc={`Risks whose next review_date is before today${periodSuffix}.`}
          />
          <KpiTile
            label="Open Incidents"
            value={openIncidents ?? '—'}
            icon={Siren}
            tone={openIncidents && openIncidents > 0 ? 'warning' : 'default'}
            loading={openIncidents === null}
            hint="Not closed/resolved"
            href="/incidents"
            calc="Count of risk_events whose status is neither closed nor resolved (all time, not period-filtered)."
          />
          <KpiTile
            label="BCP Coverage"
            value={`${bcpData.coverage}%`}
            icon={Building2}
            tone={bcpData.coverage >= 80 ? 'success' : bcpData.coverage >= 60 ? 'warning' : 'destructive'}
            loading={bcpLoading}
            hint={`${bcpData.readyPlans} of ${bcpData.totalPlans} plans Ready`}
            href="/business-continuity"
            calc="Share of BCP plans with status = Ready out of all registered plans."
          />
        </div>

        {/* Posture row */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TopRisksCard risks={risks} limit={5} />
          </div>
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4 text-primary" />
                Portfolio Snapshot
              </CardTitle>
              <CardDescription>Aggregate posture for {periodLabel.toLowerCase()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SnapshotRow
                label="Average residual score"
                value={kpis.avgResidual}
                tip={`Mean of (residual_likelihood × residual_impact) across all ${kpis.total} risks${periodSuffix}.`}
              />
              <SnapshotRow
                label="High-severity share"
                value={`${kpis.total ? Math.round((kpis.high / kpis.total) * 100) : 0}%`}
                tip={`High-severity risks (≥15) ÷ total risks${periodSuffix}.`}
                href="/risk-register?filter=high-priority"
              />
              <SnapshotRow
                label="Risks under treatment"
                value={risks.filter(r => ['In Review', 'Approved', 'Submitted'].includes(r.status as string)).length}
                tip="Risks whose workflow status is In Review, Approved, or Submitted."
              />
              <SnapshotRow
                label="Crystallized incidents"
                value={risks.filter(r => r.status === 'Crystallized').length}
                tip="Risks that have materialized — status = Crystallized."
                href="/risk-register?filter=crystallized"
              />
              <Button asChild variant="outline" size="sm" className="w-full mt-2">
                <Link to="/reports" className="flex items-center justify-center gap-2">
                  Open full analytics <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                Category Distribution
                <InfoTip text={`Risks grouped by their assigned category${periodSuffix}. Click chart segments or open the register to drill in.`} />
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/risk-register">View register <ArrowRight className="w-3 h-3 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent><RiskCategoryChart risks={risks} /></CardContent>
          </Card>
          <StatusBreakdownCard risks={risks} />
        </div>

        {/* Strategic Insights */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Strategic Insights
              <InfoTip text={`Auto-derived from the live risk register, scoped to ${periodLabel.toLowerCase()}. Refreshes with the period selector and auto-refresh interval.`} />
            </CardTitle>
            <CardDescription>
              Auto-generated from the live risk register — refreshes with the period selector
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!insights ? (
              <p className="text-sm text-muted-foreground">No risk data in selected period.</p>
            ) : (
              <div className="space-y-4">
                {insights.positive ? (
                  <InsightRow
                    tone="success"
                    title="Positive Trend"
                    calc="Category with the largest sum of (inherent score − residual score) — i.e. where controls reduced exposure most."
                  >
                    <strong>{insights.positive[0]}</strong> shows the strongest control impact —
                    aggregate residual reduction of{' '}
                    <strong>{insights.positive[1].drop}</strong> points across{' '}
                    {insights.positive[1].n} risk{insights.positive[1].n === 1 ? '' : 's'}.
                  </InsightRow>
                ) : (
                  <InsightRow tone="success" title="Positive Trend" calc="No category showed a net residual reduction in the selected period.">
                    Controls and mitigations are holding residual scores at parity with inherent across all categories.
                  </InsightRow>
                )}

                {insights.attention ? (
                  <InsightRow
                    tone="warning"
                    title="Attention Required"
                    calc="Department with the most risks scoring residual ≥ 12 in the selected period."
                  >
                    <strong>{insights.attention[0]}</strong> currently carries{' '}
                    <Link
                      to={`/risk-register?filter=high-priority`}
                      className="font-semibold underline hover:text-primary"
                    >
                      {insights.attention[1]} risk{insights.attention[1] === 1 ? '' : 's'}
                    </Link>{' '}
                    at residual score ≥ 12. Consider scheduling a deep-dive with the department owner.
                  </InsightRow>
                ) : (
                  <InsightRow tone="warning" title="Attention Required" calc="No department exceeds the elevated-risk concentration threshold (≥12).">
                    No department is concentrating elevated risk above the alert threshold.
                  </InsightRow>
                )}

                {insights.critical.length > 0 ? (
                  <InsightRow
                    tone="destructive"
                    title={`Critical Issue${insights.critical.length > 1 ? 's' : ''}`}
                    calc="Risks that are either (residual ≥ 15 AND past review_date) OR currently Escalated. Top 3 by residual score."
                  >
                    {insights.critical.length} high-severity risk{insights.critical.length === 1 ? '' : 's'} require
                    immediate executive attention:
                    <ul className="mt-2 space-y-1 text-sm">
                      {insights.critical.map(r => (
                        <li key={r.id} className="flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                          <Link to={`/risk-register?view=${r.id}`} className="hover:underline truncate">
                            {r.title}
                          </Link>
                          <Badge variant="destructive" className="ml-auto text-[10px]">
                            {residual(r)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </InsightRow>
                ) : (
                  <InsightRow tone="success" title="No Critical Escalations" calc="No risks meet the escalation criteria (residual ≥ 15 & overdue, or status Escalated).">
                    No overdue high-severity or escalated risks outstanding. Maintain regular review cadence.
                  </InsightRow>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground" aria-label="How calculated">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function KpiTile({
  label, value, icon: Icon, tone = 'default', loading, hint, href, calc,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  loading?: boolean;
  hint?: string;
  href?: string;
  calc?: string;
}) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' :
    tone === 'warning' ? 'text-warning' :
    tone === 'success' ? 'text-success' :
    'text-primary';

  const inner = (
    <Card className={`shadow-card transition-all ${href ? 'hover:shadow-md hover:border-primary/40 cursor-pointer' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {label}
          {calc && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" onClick={(e) => e.preventDefault()}>
                  <Info className="w-3 h-3 text-muted-foreground/70 hover:text-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <div className="font-semibold mb-1">How it's calculated</div>
                {calc}
              </TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        )}
        {hint && <p className="text-[11px] text-muted-foreground mt-1 truncate" title={hint}>{hint}</p>}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}

function SnapshotRow({
  label, value, tip, href,
}: {
  label: string;
  value: React.ReactNode;
  tip?: string;
  href?: string;
}) {
  const labelNode = (
    <span className="text-sm text-muted-foreground flex items-center gap-1">
      {href ? (
        <Link to={href} className="hover:text-foreground hover:underline">{label}</Link>
      ) : label}
      {tip && <InfoTip text={tip} />}
    </span>
  );
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      {labelNode}
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function InsightRow({
  tone, title, children, calc,
}: {
  tone: 'success' | 'warning' | 'destructive';
  title: string;
  children: React.ReactNode;
  calc?: string;
}) {
  const border =
    tone === 'success' ? 'border-success' :
    tone === 'warning' ? 'border-warning' :
    'border-destructive';
  const text =
    tone === 'success' ? 'text-success' :
    tone === 'warning' ? 'text-warning' :
    'text-destructive';
  return (
    <div className={`border-l-4 ${border} pl-4`}>
      <h4 className={`font-medium ${text} flex items-center gap-1.5`}>
        {title}
        {calc && <InfoTip text={calc} />}
      </h4>
      <div className="text-sm text-muted-foreground mt-1">{children}</div>
    </div>
  );
}
