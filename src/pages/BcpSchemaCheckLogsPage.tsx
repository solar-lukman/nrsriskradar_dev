import React, { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AccessDenied } from '@/components/AccessDenied';
import { RefreshCw, Search, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

interface SchemaCheckLog {
  id: string;
  checked_at: string;
  checked_by: string | null;
  status: 'ok' | 'missing_columns' | 'error';
  missing_columns: string[] | null;
  error_message: string | null;
  client_info: any;
  checker_profile?: { full_name: string | null; email: string | null } | null;
}

const ALLOWED_ROLES = ['ADMIN', 'RMD', 'CRO'];

export default function BcpSchemaCheckLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SchemaCheckLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const hasAccess = !!user && ALLOWED_ROLES.includes((user as any)?.role);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bcp_schema_check_logs' as any)
        .select(`
          id, checked_at, checked_by, status, missing_columns, error_message, client_info,
          checker_profile:profiles!checked_by(full_name, email)
        `)
        .order('checked_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setLogs((data as any) || []);
    } catch (e) {
      console.error('Failed to load schema check logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess) fetchLogs();
  }, [hasAccess]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (userFilter) {
        const hay = `${l.checker_profile?.full_name || ''} ${l.checker_profile?.email || ''} ${l.checked_by || ''}`.toLowerCase();
        if (!hay.includes(userFilter.toLowerCase())) return false;
      }
      const ts = new Date(l.checked_at).getTime();
      if (from && ts < new Date(from).getTime()) return false;
      if (to && ts > new Date(to).getTime() + 86400000) return false;
      return true;
    });
  }, [logs, statusFilter, userFilter, from, to]);

  const counts = useMemo(() => {
    return {
      ok: logs.filter((l) => l.status === 'ok').length,
      missing: logs.filter((l) => l.status === 'missing_columns').length,
      error: logs.filter((l) => l.status === 'error').length,
    };
  }, [logs]);

  if (!hasAccess) {
    return (
      <MainLayout>
        <AccessDenied message="Only ADMIN, RMD, and CRO can view BCP schema check logs." />
      </MainLayout>
    );
  }

  const renderStatus = (s: SchemaCheckLog['status']) => {
    if (s === 'ok')
      return (
        <Badge className="bg-success/10 text-success border-success/20">
          <ShieldCheck className="w-3 h-3 mr-1" /> OK
        </Badge>
      );
    if (s === 'missing_columns')
      return (
        <Badge variant="destructive">
          <ShieldAlert className="w-3 h-3 mr-1" /> Missing columns
        </Badge>
      );
    return (
      <Badge variant="destructive">
        <ShieldX className="w-3 h-3 mr-1" /> Error
      </Badge>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">BCP Schema Check Logs</h1>
            <p className="text-muted-foreground">
              Audit trail of every startup verification against the Business Continuity Plans table.
            </p>
          </div>
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">OK</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{counts.ok}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Missing columns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{counts.missing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{counts.error}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="missing_columns">Missing columns</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="User name, email, or ID"
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schema checks ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No log entries match your filters.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Checked at</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Missing columns</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Path</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(log.checked_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{renderStatus(log.status)}</TableCell>
                      <TableCell className="text-xs">
                        {log.checker_profile?.full_name || log.checker_profile?.email || (
                          <span className="text-muted-foreground">{log.checked_by || 'Unauthenticated'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.missing_columns && log.missing_columns.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.missing_columns.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate" title={log.error_message || ''}>
                        {log.error_message || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.client_info?.path || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
