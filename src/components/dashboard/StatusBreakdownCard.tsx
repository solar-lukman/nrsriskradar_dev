import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ListChecks } from 'lucide-react';
import { RiskListDrawer } from './RiskListDrawer';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface StatusBreakdownCardProps {
  risks: Risk[];
}

const STATUS_COLOR: Record<string, string> = {
  Draft: 'hsl(var(--muted-foreground))',
  Submitted: 'hsl(var(--primary))',
  'In Review': 'hsl(var(--warning))',
  Approved: 'hsl(var(--success))',
  New: 'hsl(var(--primary))',
  Mitigated: 'hsl(var(--success))',
  Escalated: 'hsl(var(--destructive))',
  Crystallized: 'hsl(var(--destructive))',
};

export function StatusBreakdownCard({ risks }: StatusBreakdownCardProps) {
  const [drawer, setDrawer] = useState<{ status: string } | null>(null);

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of risks) {
      const k = r.status || 'Unknown';
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [risks]);

  const drawerRisks = useMemo(
    () => (drawer ? risks.filter(r => (r.status || 'Unknown') === drawer.status) : []),
    [risks, drawer],
  );

  const total = risks.length;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="w-4 h-4 text-primary" />
          Status Breakdown
          <span className="text-xs font-normal text-muted-foreground ml-1">({total} risks)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No data.</p>
        ) : (
          <ChartContainer config={{}} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} width={90} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: any) => d?.status && setDrawer({ status: d.status })}
                >
                  {data.map(d => (
                    <Cell key={d.status} fill={STATUS_COLOR[d.status] || 'hsl(var(--primary))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
        <p className="text-[11px] text-muted-foreground text-center mt-1">Click a bar to see the risks in that status.</p>
      </CardContent>

      <RiskListDrawer
        open={!!drawer}
        onOpenChange={(o) => { if (!o) setDrawer(null); }}
        title={drawer ? `${drawer.status} risks` : ''}
        description={drawer ? `Risks currently in "${drawer.status}" status.` : undefined}
        risks={drawerRisks}
      />
    </Card>
  );
}
