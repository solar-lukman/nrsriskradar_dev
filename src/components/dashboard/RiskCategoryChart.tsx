import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHART_PALETTE, formatPercent, truncateLabel } from '@/lib/chartUtils';
import { RiskListDrawer } from './RiskListDrawer';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface RiskCategoryChartProps {
  risks: Risk[];
  onCategoryClick?: (category: string) => void;
}

type Dimension = 'category' | 'department' | 'status' | 'severity';
type ChartType = 'pie' | 'bar';

export function RiskCategoryChart({ risks, onCategoryClick }: RiskCategoryChartProps) {
  const [dimension, setDimension] = useState<Dimension>('category');
  const [chartType, setChartType] = useState<ChartType>('pie');
  const [drawerLabel, setDrawerLabel] = useState<string | null>(null);

  const bucketKey = (r: Risk): string => {
    switch (dimension) {
      case 'department': return r.department || 'Unassigned';
      case 'status': return r.status || 'Unknown';
      case 'severity': {
        const s = (r.residual_likelihood ?? r.inherent_likelihood ?? 0) * (r.residual_impact ?? r.inherent_impact ?? 0);
        return s >= 15 ? 'High' : s >= 10 ? 'Medium' : 'Low';
      }
      default: return r.category || 'Uncategorized';
    }
  };

  const drawerRisks = useMemo(
    () => (drawerLabel ? risks.filter(r => bucketKey(r) === drawerLabel) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [risks, drawerLabel, dimension],
  );

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of risks) {
      let key: string;
      switch (dimension) {
        case 'department':
          key = r.department || 'Unassigned';
          break;
        case 'status':
          key = r.status || 'Unknown';
          break;
        case 'severity': {
          const s = (r.residual_likelihood ?? r.inherent_likelihood ?? 0) * (r.residual_impact ?? r.inherent_impact ?? 0);
          key = s >= 15 ? 'High' : s >= 10 ? 'Medium' : 'Low';
          break;
        }
        default:
          key = r.category || 'Uncategorized';
      }
      counts[key] = (counts[key] || 0) + 1;
    }
    const total = risks.length || 1;
    return Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        percentage: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }, [risks, dimension]);

  const colorFor = (label: string, index: number) => {
    if (dimension === 'severity') {
      if (label === 'High') return 'hsl(var(--destructive))';
      if (label === 'Medium') return 'hsl(var(--warning))';
      return 'hsl(var(--success))';
    }
    return CHART_PALETTE[index % CHART_PALETTE.length];
  };

  const config = useMemo(
    () =>
      chartData.reduce((c, item, index) => {
        c[item.label] = { label: item.label, color: colorFor(item.label, index) };
        return c;
      }, {} as Record<string, { label: string; color: string }>),
    [chartData, dimension],
  );

  const dimensionLabel: Record<Dimension, string> = {
    category: 'Category',
    department: 'Department',
    status: 'Status',
    severity: 'Severity',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="department">By Department</SelectItem>
            <SelectItem value="status">By Status</SelectItem>
            <SelectItem value="severity">By Severity</SelectItem>
          </SelectContent>
        </Select>
        <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
          <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pie">Donut</SelectItem>
            <SelectItem value="bar">Bar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {risks.length === 0 ? (
        <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
          No risks to break down yet.
        </div>
      ) : chartType === 'pie' ? (
        <ChartContainer config={config} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={({ percentage }) => (percentage >= 5 ? `${percentage}%` : '')}
                outerRadius="75%"
                innerRadius="45%"
                paddingAngle={2}
                dataKey="count"
                nameKey="label"
                onClick={(data: { label?: string }) => {
                  if (!data?.label) return;
                  setDrawerLabel(data.label);
                  if (dimension === 'category') onCategoryClick?.(data.label);
                }}
                cursor="pointer"
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.label} fill={colorFor(entry.label, index)} stroke="hsl(var(--background))" strokeWidth={2} />
                ))}
              </Pie>
              <ChartTooltip
                content={<ChartTooltipContent />}
                formatter={(value, name) => {
                  const item = chartData.find((d) => d.label === name);
                  return [
                    `${value} ${Number(value) === 1 ? 'risk' : 'risks'} (${formatPercent(item?.count ?? 0, risks.length, 1)})`,
                    name,
                  ];
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                formatter={(value) => <span style={{ fontSize: 11 }}>{truncateLabel(String(value), 22)}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={120} tickFormatter={(v) => truncateLabel(String(v), 18)} />
              <ChartTooltip content={<ChartTooltipContent />} formatter={(v, n) => [`${v} risks`, n]} />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => d?.label && setDrawerLabel(d.label)}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.label} fill={colorFor(entry.label, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Showing {chartData.length} {dimensionLabel[dimension].toLowerCase()} buckets · {risks.length} risks total · click a slice to drill in
      </p>

      <RiskListDrawer
        open={!!drawerLabel}
        onOpenChange={(o) => { if (!o) setDrawerLabel(null); }}
        title={drawerLabel ? `${dimensionLabel[dimension]}: ${drawerLabel}` : ''}
        description={drawerLabel ? `Risks in this ${dimensionLabel[dimension].toLowerCase()} bucket.` : undefined}
        risks={drawerRisks as any}
      />
    </div>
  );
}
