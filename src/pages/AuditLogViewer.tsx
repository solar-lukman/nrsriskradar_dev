import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, Eye, Download, RefreshCw, ScrollText, GitBranch, Gauge, ExternalLink, History, ArrowRight, ShieldAlert, Activity, FileSearch, Filter, X, ArrowUp, ArrowDown, ArrowUpDown, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { AccessDenied } from '@/components/AccessDenied';

interface SystemAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  category: string;
  resource_type: string | null;
  resource_id: string | null;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  severity: string;
  performed_at: string;
}

interface ApprovalHistoryRow {
  id: string;
  risk_id: string;
  action: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  actor_role: string | null;
  comments: string | null;
  created_at: string;
  risk_title?: string;
  risk_reference?: string;
}

interface RiskChangeLog {
  id: string;
  risk_id: string;
  action: string;
  changes: any;
  performed_at: string;
  performed_by: string | null;
  performed_by_profile?: { full_name: string | null; email: string | null } | null;
  risk?: { title: string | null; risk_reference: string | null } | null;
}

const AuditLogViewer = () => {
  const { hasPermission, user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<SystemAuditLog[]>([]);
  const [approvalRows, setApprovalRows] = useState<ApprovalHistoryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SystemAuditLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>('7');
  const [activeTab, setActiveTab] = useState<string>('system');
  const [appetiteOnly, setAppetiteOnly] = useState(false);
  const [riskChanges, setRiskChanges] = useState<RiskChangeLog[]>([]);
  // Persisted preferences for Risk Change History
  const RC_PREFS_KEY = 'auditLogs.riskChanges.prefs.v1';
  const rcPrefs = (() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(RC_PREFS_KEY) : null;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();
  const [riskChangeSearch, setRiskChangeSearch] = useState('');
  const [riskChangeAction, setRiskChangeAction] = useState<string>('all');
  const [riskChangeFromDate, setRiskChangeFromDate] = useState<Date | undefined>(
    rcPrefs.fromDate ? new Date(rcPrefs.fromDate) : undefined
  );
  const [riskChangeToDate, setRiskChangeToDate] = useState<Date | undefined>(
    rcPrefs.toDate ? new Date(rcPrefs.toDate) : undefined
  );
  const [riskChangeSortBy, setRiskChangeSortBy] = useState<'performed_at' | 'risk' | 'action' | 'who'>(
    rcPrefs.sortBy ?? 'performed_at'
  );
  const [riskChangeSortDir, setRiskChangeSortDir] = useState<'asc' | 'desc'>(
    rcPrefs.sortDir ?? 'desc'
  );
  const [riskChangePage, setRiskChangePage] = useState(1);
  const [riskChangePageSize, setRiskChangePageSize] = useState<number>(
    [10, 25, 50, 100].includes(rcPrefs.pageSize) ? rcPrefs.pageSize : 25
  );

  // Persist preferences whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(RC_PREFS_KEY, JSON.stringify({
        sortBy: riskChangeSortBy,
        sortDir: riskChangeSortDir,
        pageSize: riskChangePageSize,
        fromDate: riskChangeFromDate ? riskChangeFromDate.toISOString() : null,
        toDate: riskChangeToDate ? riskChangeToDate.toISOString() : null,
      }));
    } catch {}
  }, [riskChangeSortBy, riskChangeSortDir, riskChangePageSize, riskChangeFromDate, riskChangeToDate]);
  const navigate = useNavigate();

  const openRisk = (id: string) => navigate(`/risk-register?view=${id}`);

  const isAppetiteLog = (log: SystemAuditLog) =>
    log.action === 'risk_exceeded_appetite' ||
    /appetite|tolerance/i.test(log.action) ||
    !!log.details?.tolerance_level ||
    !!log.details?.threshold_score;

  const categories = ['authentication', 'authorization', 'data_modification', 'system_access', 'configuration'];
  const severities = ['low', 'medium', 'high', 'critical'];

  const isAdmin = hasPermission('*');
  const canViewRiskChanges = isAdmin || ['RMD', 'CRO'].includes((user as any)?.role);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
      fetchApprovalHistory();
    }
    if (canViewRiskChanges) {
      fetchRiskChanges();
    }
  }, [isAdmin, canViewRiskChanges, dateRange]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, selectedCategory, selectedSeverity, appetiteOnly]);

  const fetchAuditLogs = async () => {
    try {
      setIsLoading(true);
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('system_audit_logs')
        .select('*')
        .gte('performed_at', daysAgo.toISOString())
        .order('performed_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch audit logs',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchApprovalHistory = async () => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('approval_history')
        .select('id, risk_id, action, from_status, to_status, actor_id, actor_role, comments, created_at, risks!inner(title, risk_reference)')
        .gte('created_at', daysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        risk_id: row.risk_id,
        action: row.action,
        from_status: row.from_status,
        to_status: row.to_status,
        actor_id: row.actor_id,
        actor_role: row.actor_role,
        comments: row.comments,
        created_at: row.created_at,
        risk_title: row.risks?.title,
        risk_reference: row.risks?.risk_reference
      }));
      setApprovalRows(mapped);
    } catch (error) {
      console.error('Error fetching approval history:', error);
    }
  };

  const fetchRiskChanges = async () => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      const { data, error } = await supabase
        .from('risk_audit_logs')
        .select(`
          id, risk_id, action, changes, performed_at, performed_by,
          performed_by_profile:profiles!performed_by(full_name, email),
          risk:risks!risk_id(title, risk_reference)
        `)
        .gte('performed_at', daysAgo.toISOString())
        .order('performed_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRiskChanges((data as any) || []);
    } catch (error) {
      console.error('Error fetching risk changes:', error);
      toast({ title: 'Error', description: 'Failed to fetch risk changes', variant: 'destructive' });
    }
  };

  const filterLogs = () => {
    let filtered = logs;

    if (appetiteOnly) {
      filtered = filtered.filter(isAppetiteLog);
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.action.toLowerCase().includes(t) ||
        log.resource_type?.toLowerCase().includes(t) ||
        JSON.stringify(log.details || {}).toLowerCase().includes(t)
      );
    }
    if (selectedCategory !== 'all') filtered = filtered.filter(log => log.category === selectedCategory);
    if (selectedSeverity !== 'all') filtered = filtered.filter(log => log.severity === selectedSeverity);

    setFilteredLogs(filtered);
  };

  const appetiteCount = useMemo(() => logs.filter(isAppetiteLog).length, [logs]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const downloadCsv = (filename: string, rows: string[]) => {
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportLogs = () => {
    const date = new Date().toISOString().split('T')[0];
    if (activeTab === 'approvals') {
      const rows = [
        ['Date & Time', 'Risk Title', 'Risk Reference', 'Action', 'From Status', 'To Status', 'Actor Role', 'Comments'].join(','),
        ...approvalRows.map(r => [
          new Date(r.created_at).toLocaleString(),
          r.risk_title || '',
          r.risk_reference || '',
          r.action,
          r.from_status || '',
          r.to_status,
          r.actor_role || '',
          (r.comments || '').replace(/"/g, '""')
        ].map(f => `"${f}"`).join(','))
      ];
      downloadCsv(`approval_history_${date}.csv`, rows);
      return;
    }
    const rows = [
      ['Date & Time', 'User ID', 'Action', 'Category', 'Severity', 'Resource Type', 'Details'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.performed_at).toLocaleString(),
        log.user_id || 'System',
        log.action,
        log.category,
        log.severity,
        log.resource_type || '',
        JSON.stringify(log.details).replace(/"/g, '""')
      ].map(field => `"${field}"`).join(','))
    ];
    downloadCsv(`audit_logs_${date}.csv`, rows);
  };

  // Set initial tab for non-admins to risk-changes
  useEffect(() => {
    if (!isAdmin && canViewRiskChanges && activeTab === 'system') {
      setActiveTab('risk-changes');
    }
  }, [isAdmin, canViewRiskChanges]);

  // Access check moved below all hooks to satisfy Rules of Hooks.

  // Filter + sort risk changes
  const filteredRiskChanges = useMemo(() => {
    const fromMs = riskChangeFromDate ? new Date(riskChangeFromDate.setHours(0, 0, 0, 0)).getTime() : null;
    const toMs = riskChangeToDate ? new Date(new Date(riskChangeToDate).setHours(23, 59, 59, 999)).getTime() : null;

    const filtered = riskChanges.filter((c) => {
      if (riskChangeAction !== 'all' && c.action !== riskChangeAction) return false;
      const ts = new Date(c.performed_at).getTime();
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs !== null && ts > toMs) return false;
      if (riskChangeSearch) {
        const t = riskChangeSearch.toLowerCase();
        const hay = [
          c.risk?.title, c.risk?.risk_reference,
          c.performed_by_profile?.full_name, c.performed_by_profile?.email,
          c.action, JSON.stringify(c.changes || {})
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });

    const dir = riskChangeSortDir === 'asc' ? 1 : -1;
    const getKey = (c: RiskChangeLog): string | number => {
      switch (riskChangeSortBy) {
        case 'risk': return (c.risk?.title || c.risk?.risk_reference || '').toLowerCase();
        case 'action': return c.action || '';
        case 'who': return (c.performed_by_profile?.full_name || c.performed_by_profile?.email || '').toLowerCase();
        case 'performed_at':
        default: return new Date(c.performed_at).getTime();
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = getKey(a); const kb = getKey(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
  }, [riskChanges, riskChangeAction, riskChangeSearch, riskChangeFromDate, riskChangeToDate, riskChangeSortBy, riskChangeSortDir]);

  const totalRiskChangePages = Math.max(1, Math.ceil(filteredRiskChanges.length / riskChangePageSize));
  const currentRiskChangePage = Math.min(riskChangePage, totalRiskChangePages);
  const pagedRiskChanges = useMemo(() => {
    const start = (currentRiskChangePage - 1) * riskChangePageSize;
    return filteredRiskChanges.slice(start, start + riskChangePageSize);
  }, [filteredRiskChanges, currentRiskChangePage, riskChangePageSize]);

  // Reset to page 1 when filters change
  useEffect(() => { setRiskChangePage(1); }, [riskChangeAction, riskChangeSearch, riskChangeFromDate, riskChangeToDate, riskChangePageSize]);

  const toggleRiskChangeSort = (col: 'performed_at' | 'risk' | 'action' | 'who') => {
    if (riskChangeSortBy === col) {
      setRiskChangeSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRiskChangeSortBy(col);
      setRiskChangeSortDir(col === 'performed_at' ? 'desc' : 'asc');
    }
  };

  const clearRiskChangeFilters = () => {
    setRiskChangeSearch('');
    setRiskChangeAction('all');
    setRiskChangeFromDate(undefined);
    setRiskChangeToDate(undefined);
  };

  const renderChangeDiff = (changes: any) => {
    if (!changes) return null;
    if (changes.before && changes.after) {
      const HIDDEN = new Set(['updated_at','created_at','id','risk_reference','ai_score_generated_at','ai_analyzed_at','ai_score_status','ai_score_reasoning','ai_score_explanation','ai_predicted_score','ai_recommended_likelihood','ai_recommended_impact','ai_confidence','submitted_at','submitted_by','approved_at','approved_by','returned_at','returned_by','current_reviewer_id','crystallized_at']);
      const fmt = (v: any): string => {
        if (v === null || v === undefined || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      };
      const fields = Object.keys(changes.after).filter(k => !HIDDEN.has(k) && JSON.stringify(changes.before[k]) !== JSON.stringify(changes.after[k]));
      if (fields.length === 0) return <p className="text-xs text-muted-foreground italic">No user-visible changes.</p>;
      return (
        <div className="space-y-1">
          {fields.map(f => (
            <div key={f} className="flex items-start gap-2 text-xs">
              <span className="font-medium min-w-[120px]">{f.replace(/_/g,' ')}</span>
              <span className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5">{fmt(changes.before[f])}</span>
              <ArrowRight className="w-3 h-3 mt-0.5 text-muted-foreground" />
              <span className="rounded bg-success/10 text-success px-1.5 py-0.5">{fmt(changes.after[f])}</span>
            </div>
          ))}
        </div>
      );
    }
    return <pre className="text-xs bg-muted/30 p-2 rounded max-h-40 overflow-auto">{JSON.stringify(changes, null, 2)}</pre>;
  };

  const criticalCount = useMemo(() => logs.filter(l => l.severity === 'critical' || l.severity === 'high').length, [logs]);
  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedSeverity !== 'all' ? 1 : 0) +
    (appetiteOnly ? 1 : 0);

  const clearSystemFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedSeverity('all');
    setAppetiteOnly(false);
  };

  const severityDot = (severity: string) => {
    const map: Record<string, string> = {
      critical: 'bg-destructive',
      high: 'bg-destructive/80',
      medium: 'bg-warning',
      low: 'bg-muted-foreground/50',
    };
    return <span className={`inline-block h-2 w-2 rounded-full ${map[severity] || 'bg-muted-foreground/50'}`} />;
  };

  if (!isAdmin && !canViewRiskChanges) {
    return (
      <MainLayout>
        <AccessDenied message="You don't have permission to view audit logs." />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="hidden md:flex h-11 w-11 rounded-xl bg-primary/10 items-center justify-center">
              <FileSearch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
              <p className="text-muted-foreground text-sm">
                Profile and role changes, approval workflow transitions, and system events.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchAuditLogs(); fetchApprovalHistory(); fetchRiskChanges(); }} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="default" size="sm" onClick={exportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isAdmin && (
            <Card className="border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ScrollText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-tight">{logs.length}</div>
                  <div className="text-xs text-muted-foreground">System events</div>
                </div>
              </CardContent>
            </Card>
          )}
          {isAdmin && (
            <Card className="border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-tight">{criticalCount}</div>
                  <div className="text-xs text-muted-foreground">High / critical</div>
                </div>
              </CardContent>
            </Card>
          )}
          {isAdmin && (
            <Card className="border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent/40 flex items-center justify-center">
                  <GitBranch className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-tight">{approvalRows.length}</div>
                  <div className="text-xs text-muted-foreground">Approval transitions</div>
                </div>
              </CardContent>
            </Card>
          )}
          {canViewRiskChanges && (
            <Card className="border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-tight">{riskChanges.length}</div>
                  <div className="text-xs text-muted-foreground">Risk changes</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/50">
            {isAdmin && (
              <TabsTrigger value="system">
                <ScrollText className="w-4 h-4 mr-2" />
                System Audit <span className="ml-1.5 text-xs text-muted-foreground">({filteredLogs.length})</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="approvals">
                <GitBranch className="w-4 h-4 mr-2" />
                Approval Workflow <span className="ml-1.5 text-xs text-muted-foreground">({approvalRows.length})</span>
              </TabsTrigger>
            )}
            {canViewRiskChanges && (
              <TabsTrigger value="risk-changes">
                <History className="w-4 h-4 mr-2" />
                Risk Changes <span className="ml-1.5 text-xs text-muted-foreground">({filteredRiskChanges.length})</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="system" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1">{activeFilterCount} active</Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                      <Button size="sm" variant="ghost" onClick={clearSystemFilters} className="h-8 text-muted-foreground">
                        <X className="w-3.5 h-3.5 mr-1" /> Clear
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={appetiteOnly ? 'default' : 'outline'}
                      onClick={() => setAppetiteOnly((v) => !v)}
                      className="gap-1 h-8"
                    >
                      <Gauge className="w-4 h-4" />
                      Appetite escalations ({appetiteCount})
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search action, resource, details..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                    <SelectTrigger>
                      <SelectValue placeholder="All severities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      {severities.map(severity => (
                        <SelectItem key={severity} value={severity}>
                          {severity.charAt(0).toUpperCase() + severity.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Last 24 hours</SelectItem>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>System Audit Logs</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Showing {filteredLogs.length} of {logs.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Loading audit logs...</div>
                ) : filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <FileSearch className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium">No audit entries match your filters</p>
                    <p className="text-sm text-muted-foreground mt-1">Try widening the date range or clearing filters.</p>
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={clearSystemFilters}>
                        <X className="w-4 h-4 mr-1" /> Clear filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date &amp; Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {new Date(log.performed_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium">{log.action}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {log.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {severityDot(log.severity)}
                              <Badge variant={getSeverityColor(log.severity) as any} className="capitalize">
                                {log.severity}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{log.resource_type || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {log.resource_type === 'risk' && log.resource_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRisk(log.resource_id!)}
                                  title="Open risk"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => setSelectedLog(log)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Audit Log Details</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-medium">Timestamp</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {selectedLog && new Date(selectedLog.performed_at).toLocaleString()}
                                      </p>
                                    </div>
                                    <div>
                                      <h4 className="font-medium">Action</h4>
                                      <p className="text-sm text-muted-foreground">{selectedLog?.action}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-medium">Category</h4>
                                      <p className="text-sm text-muted-foreground">{selectedLog?.category}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-medium">Severity</h4>
                                      <Badge variant={selectedLog ? getSeverityColor(selectedLog.severity) as any : 'outline'}>
                                        {selectedLog?.severity}
                                      </Badge>
                                    </div>
                                  </div>

                                  {selectedLog?.user_id && (
                                    <div>
                                      <h4 className="font-medium">Actor User ID</h4>
                                      <p className="text-sm text-muted-foreground font-mono">{selectedLog.user_id}</p>
                                    </div>
                                  )}

                                  {selectedLog?.details && Object.keys(selectedLog.details).length > 0 && (
                                    <div>
                                      <h4 className="font-medium">Details</h4>
                                      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-60">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                 </div>
                              </DialogContent>
                            </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Risk Approval Workflow History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {approvalRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <GitBranch className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium">No approval transitions recorded</p>
                    <p className="text-sm text-muted-foreground mt-1">No risks were submitted, approved, or returned in this period.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date &amp; Time</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Actor Role</TableHead>
                        <TableHead>Comments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvalRows.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {new Date(row.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{row.risk_title || '—'}</div>
                            <div className="text-xs text-muted-foreground">{row.risk_reference || ''}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="font-normal">{row.action}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.from_status || '—'}</TableCell>
                          <TableCell><Badge>{row.to_status}</Badge></TableCell>
                          <TableCell className="text-sm">{row.actor_role || '—'}</TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground truncate" title={row.comments || ''}>
                            {row.comments || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canViewRiskChanges && (
            <TabsContent value="risk-changes" className="space-y-4">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-muted-foreground" /> Filters
                    </span>
                    {(riskChangeSearch || riskChangeAction !== 'all' || riskChangeFromDate || riskChangeToDate) && (
                      <Button size="sm" variant="ghost" onClick={clearRiskChangeFilters} className="h-8 text-muted-foreground">
                        <X className="w-3.5 h-3.5 mr-1" /> Clear
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative md:col-span-2">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by risk title, reference, or actor..."
                        value={riskChangeSearch}
                        onChange={(e) => setRiskChangeSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={riskChangeAction} onValueChange={setRiskChangeAction}>
                      <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="updated">Updated</SelectItem>
                        <SelectItem value="status_changed">Status changed</SelectItem>
                        <SelectItem value="deleted">Deleted</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !riskChangeFromDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {riskChangeFromDate ? format(riskChangeFromDate, 'MMM d, yyyy') : 'From'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={riskChangeFromDate}
                            onSelect={setRiskChangeFromDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !riskChangeToDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {riskChangeToDate ? format(riskChangeToDate, 'MMM d, yyyy') : 'To'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={riskChangeToDate}
                            onSelect={setRiskChangeToDate}
                            disabled={(d) => riskChangeFromDate ? d < riskChangeFromDate : false}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Risk Change History</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Showing {pagedRiskChanges.length} of {filteredRiskChanges.length} (total {riskChanges.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredRiskChanges.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <History className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No risk changes recorded</p>
                      <p className="text-sm text-muted-foreground mt-1">Try widening the date range or clearing filters.</p>
                    </div>
                  ) : (
                    <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <button onClick={() => toggleRiskChangeSort('performed_at')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              When
                              {riskChangeSortBy === 'performed_at'
                                ? (riskChangeSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </button>
                          </TableHead>
                          <TableHead>
                            <button onClick={() => toggleRiskChangeSort('risk')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              Risk
                              {riskChangeSortBy === 'risk'
                                ? (riskChangeSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </button>
                          </TableHead>
                          <TableHead>
                            <button onClick={() => toggleRiskChangeSort('action')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              Action
                              {riskChangeSortBy === 'action'
                                ? (riskChangeSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </button>
                          </TableHead>
                          <TableHead>
                            <button onClick={() => toggleRiskChangeSort('who')} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                              Who
                              {riskChangeSortBy === 'who'
                                ? (riskChangeSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </button>
                          </TableHead>
                          <TableHead>What changed</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedRiskChanges.map((c) => (
                          <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="font-mono text-xs whitespace-nowrap">
                              {new Date(c.performed_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{c.risk?.title || '—'}</div>
                              <div className="text-xs text-muted-foreground">{c.risk?.risk_reference || ''}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={c.action === 'created' ? 'default' : c.action === 'deleted' ? 'destructive' : 'outline'}>
                                {c.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.performed_by_profile?.full_name || c.performed_by_profile?.email || '—'}
                            </TableCell>
                            <TableCell className="max-w-md">
                              {c.action === 'updated' ? renderChangeDiff(c.changes) :
                               c.action === 'created' ? <span className="text-xs text-muted-foreground">Risk created</span> :
                               c.action === 'status_changed' ? (
                                 <span className="text-xs">
                                   <span className="text-muted-foreground">{c.changes?.from || '—'}</span>
                                   {' → '}
                                   <span className="font-medium">{c.changes?.to || '—'}</span>
                                 </span>
                               ) :
                               <span className="text-xs text-muted-foreground">{c.action}</span>}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => openRisk(c.risk_id)} title="Open risk">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Rows per page</span>
                        <Select value={String(riskChangePageSize)} onValueChange={(v) => setRiskChangePageSize(Number(v))}>
                          <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          Page {currentRiskChangePage} of {totalRiskChangePages}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setRiskChangePage(1)}
                            disabled={currentRiskChangePage <= 1}
                          >
                            First
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setRiskChangePage(p => Math.max(1, p - 1))}
                            disabled={currentRiskChangePage <= 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setRiskChangePage(p => Math.min(totalRiskChangePages, p + 1))}
                            disabled={currentRiskChangePage >= totalRiskChangePages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setRiskChangePage(totalRiskChangePages)}
                            disabled={currentRiskChangePage >= totalRiskChangePages}
                          >
                            Last
                          </Button>
                        </div>
                      </div>
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default AuditLogViewer;
