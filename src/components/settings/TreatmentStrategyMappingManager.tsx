import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Workflow, Save, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VALID_RISK_STATUSES, type RiskStatus } from '@/lib/riskWorkflow';

interface MappingRow {
  id: string;
  treatment_strategy: string;
  target_status: RiskStatus;
  description: string | null;
  is_active: boolean;
}

const TREATMENT_STRATEGIES = ['Mitigate', 'Avoid', 'Transfer', 'Accept'] as const;

export function TreatmentStrategyMappingManager() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('treatment_strategy_status_map' as any)
      .select('*')
      .order('treatment_strategy');
    if (error) {
      toast.error('Failed to load mappings', { description: error.message });
    } else {
      setRows(((data as any) || []) as MappingRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const updateLocal = (id: string, patch: Partial<MappingRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: MappingRow) => {
    if (!VALID_RISK_STATUSES.includes(row.target_status)) {
      toast.error('Invalid status', { description: `"${row.target_status}" is not a valid risk status.` });
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from('treatment_strategy_status_map' as any)
      .update({
        target_status: row.target_status,
        is_active: row.is_active,
        description: row.description,
      })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      toast.error('Save failed', { description: error.message });
    } else {
      toast.success('Mapping updated', {
        description: `${row.treatment_strategy} → ${row.target_status}`,
      });
      fetchRows();
    }
  };

  const ensureDefaults = async () => {
    const existing = new Set(rows.map((r) => r.treatment_strategy));
    const missing = TREATMENT_STRATEGIES.filter((s) => !existing.has(s));
    if (missing.length === 0) return;
    const inserts = missing.map((s) => ({
      treatment_strategy: s,
      target_status: s === 'Accept' ? 'New' : 'In Review',
      is_active: true,
    }));
    const { error } = await supabase.from('treatment_strategy_status_map' as any).insert(inserts as any);
    if (error) toast.error('Could not seed defaults', { description: error.message });
    else fetchRows();
  };

  useEffect(() => {
    if (!loading && rows.length > 0) ensureDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="w-5 h-5" /> Treatment Strategy → Status Mapping
        </CardTitle>
        <CardDescription>
          Configure which lifecycle status is auto-set when each treatment strategy is selected
          during risk submission. Only valid <code className="text-xs">risk_status</code> enum values
          are allowed, so submissions never fail with a constraint error.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription className="text-sm">
            Allowed statuses: {VALID_RISK_STATUSES.map((s) => (
              <Badge key={s} variant="outline" className="mr-1 mb-1">{s}</Badge>
            ))}
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No mappings configured. Defaults will be created automatically.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treatment Strategy</TableHead>
                <TableHead>Auto-Set Status</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-24 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="secondary">{row.treatment_strategy}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.target_status}
                      onValueChange={(v) => updateLocal(row.id, { target_status: v as RiskStatus })}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VALID_RISK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(checked) => updateLocal(row.id, { is_active: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => saveRow(row)}
                      disabled={savingId === row.id}
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {savingId === row.id ? 'Saving…' : 'Save'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
