import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Legend, AreaChart, Area, BarChart, Bar,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, startOfMonth, eachMonthOfInterval, subMonths, endOfMonth, isValid } from 'date-fns';
import { formatCompactNumber } from '@/lib/chartUtils';
import { RiskListDrawer } from './RiskListDrawer';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface RiskTrendChartProps {
  risks: Risk[];
  defaultMonths?: number;
}

type Metric = 'flow' | 'severity' | 'cumulative';

export function RiskTrendChart({ risks, defaultMonths = 6 }: RiskTrendChartProps) {
  const [months, setMonths] = useState<number>(defaultMonths);
  const [metric, setMetric] = useState<Metric>('flow');
  const [drawer, setDrawer] = useState<{ title: string; description: string; risks: Risk[] } | null>(null);

  const chartData = useMemo(() => {
    const now = new Date();
    const start = subMonths(now, months - 1);
    const range = eachMonthOfInterval({ start, end: now });

    let cumulative = 0;
    let cumulativeMitigated = 0;

    return range.map((m) => {
      const monthStart = startOfMonth(m);
      const monthEnd = endOfMonth(m);
      const monthRisks = risks.filter((risk) => {
        if (!risk.created_at) return false;
        const d = parseISO(risk.created_at);
        return isValid(d) && d >= monthStart && d <= monthEnd;
      });
      const newRisks = monthRisks.length;
      const highRisks = monthRisks.filter(r => (r.inherent_likelihood || 0) * (r.inherent_impact || 0) >= 15).length;
      const mediumRisks = monthRisks.filter(r => {
        const s = (r.inherent_likelihood || 0) * (r.inherent_impact || 0);
        return s >= 10 && s < 15;
      }).length;
      const lowRisks = monthRisks.filter(r => (r.inherent_likelihood || 0) * (r.inherent_impact || 0) < 10).length;
      const mitigatedRisks = monthRisks.filter((r) => r.status === 'Mitigated').length;

      cumulative += newRisks;
      cumulativeMitigated += mitigatedRisks;
      const openCumulative = Math.max(0, cumulative - cumulativeMitigated);

      return {
        month: format(m, 'MMM'),
        fullMonth: format(m, 'MMMM yyyy'),
        msIso: monthStart.toISOString(),
        meIso: monthEnd.toISOString(),
        newRisks,
        highRisks,
        mediumRisks,
        lowRisks,
        mitigatedRisks,
        cumulativeOpen: openCumulative,
        cumulativeTotal: cumulative,
        cumulativeMitigated,
      };
    });
  }, [risks, months]);

  const hasData = chartData.some((d) => d.newRisks > 0 || d.cumulativeTotal > 0);

  const openDrawerForMonth = (payload: any) => {
    if (!payload?.msIso || !payload?.meIso) return;
    const ms = new Date(payload.msIso).getTime();
    const me = new Date(payload.meIso).getTime();

    if (metric === 'flow') {
      const monthRisks = risks.filter(r => {
        if (!r.created_at) return false;
        const t = new Date(r.created_at).getTime();
        return t >= ms && t <= me;
      });
      setDrawer({
        title: `Risks created in ${payload.fullMonth}`,
        description: `${monthRisks.length} new risks recorded that month.`,
        risks: monthRisks,
      });
    } else if (metric === 'severity') {
      const monthRisks = risks.filter(r => {
        if (!r.created_at) return false;
        const t = new Date(r.created_at).getTime();
        return t >= ms && t <= me;
      });
      setDrawer({
        title: `Risks created in ${payload.fullMonth}`,
        description: 'Grouped by inherent severity (High ≥15, Medium 10–14, Low <10).',
        risks: monthRisks,
      });
    } else {
      // cumulative open: all risks created on/before month end, not yet mitigated
      const cumulativeRisks = risks.filter(r => {
        if (!r.created_at) return false;
        return new Date(r.created_at).getTime() <= me && r.status !== 'Mitigated';
      });
      setDrawer({
        title: `Open risks as of ${payload.fullMonth}`,
        description: 'Risks created up to month end and not yet mitigated.',
        risks: cumulativeRisks,
      });
    }
  };

  const onChartClick = (e: any) => {
    const p = e?.activePayload?.[0]?.payload;
    if (p) openDrawerForMonth(p);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="flow">Risk flow</SelectItem>
            <SelectItem value="severity">By severity</SelectItem>
            <SelectItem value="cumulative">Cumulative open</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
          No risks recorded in this period.
        </div>
      ) : metric === 'flow' ? (
        <ChartContainer
          config={{
            newRisks: { label: 'New Risks', color: 'hsl(var(--primary))' },
            highRisks: { label: 'High Priority', color: 'hsl(var(--destructive))' },
            mitigatedRisks: { label: 'Mitigated', color: 'hsl(var(--success))' },
          }}
          className="h-[300px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} onClick={onChartClick} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="newG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="highG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mitG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickMargin={6} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactNumber(v)} allowDecimals={false} width={36} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={(value, payload) => (payload?.[0]?.payload as any)?.fullMonth || String(value)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Area type="monotone" dataKey="newRisks" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#newG)" name="New Risks" />
              <Area type="monotone" dataKey="highRisks" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#highG)" name="High Priority" />
              <Area type="monotone" dataKey="mitigatedRisks" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#mitG)" name="Mitigated" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      ) : metric === 'severity' ? (
        <ChartContainer
          config={{
            highRisks: { label: 'High', color: 'hsl(var(--destructive))' },
            mediumRisks: { label: 'Medium', color: 'hsl(var(--warning))' },
            lowRisks: { label: 'Low', color: 'hsl(var(--success))' },
          }}
          className="h-[300px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} onClick={onChartClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} labelFormatter={(v, p) => (p?.[0]?.payload as any)?.fullMonth || String(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="highRisks" stackId="s" fill="hsl(var(--destructive))" name="High" radius={[0, 0, 0, 0]} />
              <Bar dataKey="mediumRisks" stackId="s" fill="hsl(var(--warning))" name="Medium" />
              <Bar dataKey="lowRisks" stackId="s" fill="hsl(var(--success))" name="Low" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      ) : (
        <ChartContainer
          config={{
            cumulativeOpen: { label: 'Open (cumulative)', color: 'hsl(var(--primary))' },
            cumulativeMitigated: { label: 'Mitigated (cumulative)', color: 'hsl(var(--success))' },
          }}
          className="h-[300px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} onClick={onChartClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} labelFormatter={(v, p) => (p?.[0]?.payload as any)?.fullMonth || String(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Line type="monotone" dataKey="cumulativeOpen" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Open (cumulative)" />
              <Line type="monotone" dataKey="cumulativeMitigated" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} name="Mitigated (cumulative)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      <p className="text-[11px] text-muted-foreground text-center">Click any month to see the risks behind the number.</p>

      <RiskListDrawer
        open={!!drawer}
        onOpenChange={(o) => { if (!o) setDrawer(null); }}
        title={drawer?.title || ''}
        description={drawer?.description}
        risks={drawer?.risks || []}
      />
    </div>
  );
}
