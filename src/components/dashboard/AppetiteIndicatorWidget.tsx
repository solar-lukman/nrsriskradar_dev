import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Gauge, AlertTriangle, TrendingUp, ExternalLink, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRiskAppetite } from '@/hooks/useRiskAppetite';
import { useNavigate } from 'react-router-dom';

interface RiskRow {
  id: string;
  title: string;
  risk_reference: string | null;
  risk_type: 'institutional' | 'compliance';
  category: string | null;
  taxpayer_segment: string | null;
  residual_likelihood: number | null;
  residual_impact: number | null;
  approval_status: string;
}

interface AppetiteSummary {
  scope: string;
  total: number;
  exceeding: number;
  threshold: number;
  toleranceLevel: string;
  escalationAction: string;
}

const ACTION_LABELS: Record<string, string> = {
  notify: 'Notify',
  escalate: 'Escalate',
  flag_audit: 'Flag for audit',
};

export function AppetiteIndicatorWidget() {
  const { configs, loading: configsLoading, resolveForRisk } = useRiskAppetite();
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(5);
  const navigate = useNavigate();

  const openRisk = (r: RiskRow) => {
    const register = r.risk_type === 'compliance' ? 'compliance' : 'institutional';
    navigate(`/risk-register?register=${register}&view=${r.id}`);
  };

  const exportExceededCsv = () => {
    const header = [
      'risk_reference',
      'title',
      'risk_type',
      'category',
      'taxpayer_segment',
      'residual_likelihood',
      'residual_impact',
      'residual_score',
      'threshold_score',
      'tolerance_level',
      'escalation_action',
      'over_by',
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = exceedingRisks.map((e) =>
      [
        e.risk.risk_reference ?? '',
        e.risk.title,
        e.risk.risk_type,
        e.risk.category ?? '',
        e.risk.taxpayer_segment ?? '',
        e.risk.residual_likelihood ?? '',
        e.risk.residual_impact ?? '',
        e.score,
        e.threshold,
        e.toleranceLevel,
        e.escalationAction,
        e.score - e.threshold,
      ]
        .map(escape)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `risks-exceeding-appetite-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('risks')
        .select(
          'id,title,risk_reference,risk_type,category,taxpayer_segment,residual_likelihood,residual_impact,approval_status'
        )
        .eq('approval_status', 'Approved');
      setRisks((data || []) as RiskRow[]);
      setLoading(false);
    })();
  }, []);

  const { summaries, exceedingRisks } = useMemo(() => {
    const byScope = new Map<string, AppetiteSummary>();
    const exceeding: Array<{
      risk: RiskRow;
      score: number;
      threshold: number;
      toleranceLevel: string;
      escalationAction: string;
    }> = [];

    for (const r of risks) {
      const score =
        (r.residual_likelihood ?? 0) * (r.residual_impact ?? 0);
      const appetite = resolveForRisk({
        risk_type: r.risk_type,
        category: r.category,
        taxpayer_segment: r.taxpayer_segment,
      });
      if (!appetite) continue;

      const scopeLabel =
        r.risk_type === 'compliance'
          ? `Compliance · ${r.taxpayer_segment || 'All segments'}`
          : `Institutional · ${r.category || 'All'}`;

      const current = byScope.get(scopeLabel) ?? {
        scope: scopeLabel,
        total: 0,
        exceeding: 0,
        threshold: appetite.threshold_score,
        toleranceLevel: appetite.tolerance_level,
        escalationAction: appetite.escalation_action,
      };
      current.total += 1;
      if (score >= appetite.threshold_score) {
        current.exceeding += 1;
        exceeding.push({
          risk: r,
          score,
          threshold: appetite.threshold_score,
          toleranceLevel: appetite.tolerance_level,
          escalationAction: appetite.escalation_action,
        });
      }
      byScope.set(scopeLabel, current);
    }

    return {
      summaries: Array.from(byScope.values()).sort((a, b) =>
        a.scope.localeCompare(b.scope)
      ),
      exceedingRisks: exceeding.sort((a, b) => b.score - a.score),
    };
  }, [risks, resolveForRisk]);

  if (loading || configsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" /> Risk Appetite
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-6 text-center">
          Loading appetite indicators…
        </CardContent>
      </Card>
    );
  }

  if (configs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" /> Risk Appetite
          </CardTitle>
          <CardDescription>
            No appetite thresholds configured yet. Admins can add rules in
            Settings → Risk Management.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalExceeding = exceedingRisks.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5" /> Risk Appetite vs. Tolerance
            </CardTitle>
            <CardDescription>
              Approved risks measured against configured appetite thresholds
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalExceeding > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {totalExceeding} over limit
              </Badge>
            )}
            {exceedingRisks.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 gap-1 text-xs"
                onClick={exportExceededCsv}
                title="Download all exceeded risks as CSV"
              >
                <Download className="w-3 h-3" />
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summaries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No approved risks fall under any configured appetite scope.
          </div>
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => {
              const pct = s.total > 0 ? (s.exceeding / s.total) * 100 : 0;
              return (
                <div key={s.scope} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.scope}</span>
                      <Badge variant="outline" className="text-xs">
                        {s.toleranceLevel} · ≥ {s.threshold}
                      </Badge>
                    </div>
                    <span
                      className={
                        s.exceeding > 0
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground'
                      }
                    >
                      {s.exceeding} / {s.total}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={
                      pct > 0
                        ? '[&>div]:bg-destructive'
                        : '[&>div]:bg-success'
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {exceedingRisks.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              <div className="font-medium mb-2">
                Risks exceeding configured appetite
              </div>
              <ul className="space-y-1.5 text-sm">
                {exceedingRisks.slice(0, visibleCount).map((e) => (
                  <li
                    key={e.risk.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-background/60 p-2"
                  >
                    <TrendingUp className="w-3 h-3 shrink-0" />
                    <span className="font-medium font-mono text-xs">
                      {e.risk.risk_reference || '—'}
                    </span>
                    <span className="truncate flex-1 min-w-[120px] text-foreground">
                      {e.risk.title}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {e.toleranceLevel}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Action: {ACTION_LABELS[e.escalationAction] ?? e.escalationAction}
                    </Badge>
                    <Badge variant="destructive" className="text-xs">
                      {e.score} / {e.threshold}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 text-xs"
                      onClick={() => openRisk(e.risk)}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
              {exceedingRisks.length > visibleCount && (
                <div className="flex items-center justify-between gap-2 pt-2 text-xs">
                  <span className="text-muted-foreground">
                    Showing {visibleCount} of {exceedingRisks.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setVisibleCount((c) =>
                          Math.min(c + 5, exceedingRisks.length)
                        )
                      }
                    >
                      Show 5 more
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setVisibleCount(exceedingRisks.length)}
                    >
                      View all ({exceedingRisks.length})
                    </Button>
                  </div>
                </div>
              )}
              {visibleCount > 5 && exceedingRisks.length <= visibleCount && (
                <div className="pt-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setVisibleCount(5)}
                  >
                    Collapse
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
