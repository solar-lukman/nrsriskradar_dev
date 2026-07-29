import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame } from 'lucide-react';
import { ViewRiskDialog } from '@/components/risk-register/ViewRiskDialog';
import { RiskListDrawer } from './RiskListDrawer';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface TopRisksCardProps {
  risks: Risk[];
  limit?: number;
}

export function TopRisksCard({ risks, limit = 5 }: TopRisksCardProps) {
  const [activeRisk, setActiveRisk] = useState<Risk | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const top = useMemo(() => {
    return [...risks]
      .map(r => ({
        ...r,
        residualScore: (r.residual_likelihood ?? 0) * (r.residual_impact ?? 0),
        inherentScore: (r.inherent_likelihood ?? 0) * (r.inherent_impact ?? 0),
      }))
      .sort((a, b) => b.residualScore - a.residualScore)
      .slice(0, limit);
  }, [risks, limit]);

  const allByResidual = useMemo(
    () => [...risks].sort(
      (a, b) =>
        (b.residual_likelihood ?? 0) * (b.residual_impact ?? 0) -
        (a.residual_likelihood ?? 0) * (a.residual_impact ?? 0),
    ),
    [risks],
  );

  const maxScore = top[0]?.residualScore || 25;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-destructive" />
            Top {limit} Risks (by Residual Score)
          </span>
          {risks.length > limit && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="text-xs font-normal text-primary hover:underline"
            >
              View all →
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No risks in current view.</p>
        ) : (
          <ul className="space-y-3">
            {top.map((r, i) => {
              const pct = (r.residualScore / maxScore) * 100;
              const tone = r.residualScore >= 15 ? 'bg-destructive' : r.residualScore >= 10 ? 'bg-warning' : 'bg-success';
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setActiveRisk(r as Risk)}
                    className="w-full text-left space-y-1 rounded-md p-1 -m-1 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                        <span className="font-medium truncate" title={r.title}>{r.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5">{r.department || '—'}</Badge>
                        <Badge className={`text-xs ${tone} text-white`}>{r.residualScore}</Badge>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {activeRisk && (
        <ViewRiskDialog
          open={!!activeRisk}
          onOpenChange={(o) => { if (!o) setActiveRisk(null); }}
          risk={activeRisk}
        />
      )}

      <RiskListDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="All risks by residual score"
        description="Ranked from highest to lowest residual risk score."
        risks={allByResidual}
      />
    </Card>
  );
}
