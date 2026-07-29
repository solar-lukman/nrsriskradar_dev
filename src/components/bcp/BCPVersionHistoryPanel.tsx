import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, History, Loader2 } from 'lucide-react';

interface VersionRow {
  id: string;
  action: 'created' | 'updated';
  changed_fields: string[];
  before_values: Record<string, any>;
  after_values: Record<string, any>;
  performed_by: string | null;
  performed_at: string;
  performer?: { full_name: string | null; email: string | null } | null;
}

interface Props {
  bcpId: string;
}

const FIELD_LABELS: Record<string, string> = {
  bia_criticality_rating: 'Criticality',
  bia_financial_impact: 'Financial impact',
  bia_operational_impact: 'Operational impact',
  bia_reputational_impact: 'Reputational impact',
  bia_regulatory_impact: 'Regulatory impact',
  bia_max_tolerable_downtime: 'Max tolerable downtime',
  bia_assessment_date: 'Assessment date',
  test_type: 'Test type',
  test_scope: 'Test scope',
  test_results: 'Test results',
  test_findings: 'Test findings',
};

const fmt = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export function BCPVersionHistoryPanel({ bcpId }: Props) {
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('bcp_version_history' as any)
        .select(`
          id, action, changed_fields, before_values, after_values, performed_by, performed_at,
          performer:profiles!performed_by(full_name, email)
        `)
        .eq('bcp_id', bcpId)
        .order('performed_at', { ascending: false })
        .limit(100);
      if (!cancel) {
        if (!error) setRows((data as any) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [bcpId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-4 h-4" /> Version History (BIA & Test Details)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading history...
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracked changes yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.action === 'created' ? 'default' : 'secondary'}>{r.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {r.performer?.full_name || r.performer?.email || 'System'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.performed_at).toLocaleString()}
                  </span>
                </div>
                {r.changed_fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No tracked field changes.</p>
                ) : (
                  <div className="space-y-1">
                    {r.changed_fields.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-xs">
                        <span className="font-medium min-w-[150px]">{FIELD_LABELS[f] || f}</span>
                        {r.action === 'updated' ? (
                          <>
                            <span className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5">
                              {fmt(r.before_values?.[f])}
                            </span>
                            <ArrowRight className="w-3 h-3 mt-0.5 text-muted-foreground" />
                            <span className="rounded bg-success/10 text-success px-1.5 py-0.5">
                              {fmt(r.after_values?.[f])}
                            </span>
                          </>
                        ) : (
                          <span className="rounded bg-success/10 text-success px-1.5 py-0.5">
                            {fmt(r.after_values?.[f])}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
