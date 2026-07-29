import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Legend,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths, isValid } from 'date-fns';
import { TrendingDown } from 'lucide-react';
import { RiskListDrawer } from './RiskListDrawer';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface MaturityTrendCardProps {
  risks: Risk[];
}

export function MaturityTrendCard({ risks }: MaturityTrendCardProps) {
  const [months, setMonths] = useState(6);
  const [drawer, setDrawer] = useState<{ fullMonth: string; meIso: string } | null>(null);

  const data = useMemo(() => {
    const now = new Date();
    const start = subMonths(now, months - 1);
    const range = eachMonthOfInterval({ start, end: now });

    return range.map(m => {
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      const existing = risks.filter(r => {
        if (!r.created_at) return false;
        const d = parseISO(r.created_at);
        return isValid(d) && d <= me;
      });
      const inherent = existing.length
        ? existing.reduce((s, r) => s + (r.inherent_likelihood ?? 0) * (r.inherent_impact ?? 0), 0) / existing.length
        : 0;
      const residual = existing.length
        ? existing.reduce((s, r) => s + (r.residual_likelihood ?? 0) * (r.residual_impact ?? 0), 0) / existing.length
        : 0;
      const maturity = inherent > 0 ? Math.max(0, Math.round(((inherent - residual) / inherent) * 100)) : 0;
      return {
        month: format(m, 'MMM'),
        fullMonth: format(m, 'MMMM yyyy'),
        meIso: me.toISOString(),
        inherent: Math.round(inherent * 10) / 10,
        residual: Math.round(residual * 10) / 10,
        maturity,
      };
    });
  }, [risks, months]);

  const drawerRisks = useMemo(() => {
    if (!drawer) return [];
    const cutoff = new Date(drawer.meIso).getTime();
    return risks
      .filter(r => r.created_at && new Date(r.created_at).getTime() <= cutoff)
      .sort((a, b) =>
        (b.residual_likelihood ?? 0) * (b.residual_impact ?? 0) -
        (a.residual_likelihood ?? 0) * (a.residual_impact ?? 0),
      );
  }, [risks, drawer]);

  const config = {
    inherent: { label: 'Avg Inherent', color: 'hsl(var(--destructive))' },
    residual: { label: 'Avg Residual', color: 'hsl(var(--warning))' },
    maturity: { label: 'Maturity %', color: 'hsl(var(--success))' },
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="w-4 h-4 text-success" />
            Risk Maturity Trend
          </CardTitle>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p?.fullMonth && p?.meIso) setDrawer({ fullMonth: p.fullMonth, meIso: p.meIso });
              }}
              style={{ cursor: 'pointer' }}
            >
              <defs>
                <linearGradient id="matG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="score" tick={{ fontSize: 11 }} width={32} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} width={32} domain={[0, 100]} unit="%" />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={(v, p) => (p?.[0]?.payload as any)?.fullMonth || String(v)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Area
                yAxisId="pct" type="monotone" dataKey="maturity"
                stroke="hsl(var(--success))" strokeWidth={2} fill="url(#matG)" name="Maturity %"
              />
              <Line yAxisId="score" type="monotone" dataKey="inherent" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Avg Inherent" />
              <Line yAxisId="score" type="monotone" dataKey="residual" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Avg Residual" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
        <p className="text-[11px] text-muted-foreground text-center mt-1">Click a month to see all risks active up to that point.</p>
      </CardContent>

      <RiskListDrawer
        open={!!drawer}
        onOpenChange={(o) => { if (!o) setDrawer(null); }}
        title={drawer ? `Risks active by ${drawer.fullMonth}` : ''}
        description="All risks created on or before the end of this month, ranked by residual score."
        risks={drawerRisks}
      />
    </Card>
  );
}
