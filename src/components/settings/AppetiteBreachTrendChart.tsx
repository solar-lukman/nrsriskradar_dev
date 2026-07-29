import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { truncateLabel } from '@/lib/chartUtils';
import { supabase } from '@/integrations/supabase/client';
import { useRiskAppetite, AppetiteConfig } from '@/hooks/useRiskAppetite';

type WindowDays = 7 | 30 | 90 | 365;

interface BreachLog {
  id: string;
  performed_at: string;
  details: {
    risk_reference?: string;
    threshold_score?: number;
    tolerance_level?: string;
    escalation_action?: string;
    risk_score?: number;
  } | null;
}

interface RuleStat {
  rule: AppetiteConfig;
  count: number;
  lastBreach?: string;
}

const ACTION_LABELS: Record<string, string> = {
  notify: 'Notify',
  escalate: 'Escalate',
  flag_audit: 'Flag for audit',
};

const ruleSignature = (
  threshold: number | undefined,
  tolerance: string | undefined,
  action: string | undefined,
) => `${threshold ?? '?'}|${tolerance ?? '?'}|${action ?? '?'}`;

export function AppetiteBreachTrendChart() {
  const { configs, loading: configsLoading } = useRiskAppetite();
  const [logs, setLogs] = useState<BreachLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<WindowDays>(90);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('system_audit_logs')
        .select('id, performed_at, details')
        .eq('action', 'risk_exceeded_appetite')
        .gte('performed_at', since)
        .order('performed_at', { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) {
        console.error('Appetite breach log fetch error:', error);
        setLogs([]);
      } else {
        setLogs((data ?? []) as unknown as BreachLog[]);
      }
      setLoading(false);
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const stats = useMemo<RuleStat[]>(() => {
    if (configs.length === 0) return [];
    const bySig = new Map<string, { count: number; lastBreach?: string }>();
    for (const log of logs) {
      const d = log.details ?? {};
      const sig = ruleSignature(
        d.threshold_score,
        d.tolerance_level,
        d.escalation_action,
      );
      const entry = bySig.get(sig) ?? { count: 0 };
      entry.count += 1;
      if (!entry.lastBreach || log.performed_at > entry.lastBreach) {
        entry.lastBreach = log.performed_at;
      }
      bySig.set(sig, entry);
    }
    return configs.map((rule) => {
      const sig = ruleSignature(
        rule.threshold_score,
        rule.tolerance_level,
        rule.escalation_action,
      );
      const entry = bySig.get(sig) ?? { count: 0 };
      return { rule, count: entry.count, lastBreach: entry.lastBreach };
    });
  }, [logs, configs]);

  const chartData = useMemo(
    () =>
      stats
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((s) => ({
          name: `${s.rule.tolerance_level} ≥${s.rule.threshold_score}${
            s.rule.category ? ` · ${s.rule.category}` : ''
          }${s.rule.taxpayer_segment ? ` · ${s.rule.taxpayer_segment}` : ''}`,
          breaches: s.count,
        })),
    [stats],
  );

  const totalBreaches = logs.length;
  const isLoading = loading || configsLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Appetite Breach Trend
            </CardTitle>
            <CardDescription>
              How often each appetite rule has been triggered in the selected
              period.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{totalBreaches} total breaches</Badge>
            <Select
              value={String(windowDays)}
              onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 365 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
            <AlertCircle className="w-6 h-6 mb-2 opacity-50" />
            No appetite breaches recorded in this period.
          </div>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => truncateLabel(v, 28)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="breaches"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 border-t pt-3 space-y-1 text-xs text-muted-foreground">
              {stats
                .filter((s) => s.count > 0)
                .slice(0, 5)
                .map((s) => (
                  <div
                    key={s.rule.id}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">
                      <Badge variant="outline" className="mr-2">
                        {s.rule.tolerance_level}
                      </Badge>
                      ≥{s.rule.threshold_score} ·{' '}
                      {ACTION_LABELS[s.rule.escalation_action] ??
                        s.rule.escalation_action}
                      {s.rule.category && ` · ${s.rule.category}`}
                      {s.rule.taxpayer_segment && ` · ${s.rule.taxpayer_segment}`}
                    </span>
                    <span>
                      {s.count} {s.count === 1 ? 'breach' : 'breaches'}
                      {s.lastBreach &&
                        ` · last ${new Date(s.lastBreach).toLocaleDateString()}`}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
