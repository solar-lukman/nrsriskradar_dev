import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, Zap, Clock, TrendingUp, ShieldAlert,
  BarChart3, Activity, Filter, CalendarDays, Plus, X, CalendarIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IncidentsTable } from '@/components/incidents/IncidentsTable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, Area, AreaChart 
} from 'recharts';
import { format, differenceInDays, subMonths, startOfMonth, parseISO } from 'date-fns';
import { AddIncidentDialog } from '@/components/incidents/AddIncidentDialog';
import { ExportIncidentsMenu } from '@/components/incidents/ExportIncidentsMenu';
import { useAuth } from '@/contexts/AuthContext';

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'hsl(0, 65%, 51%)',
  High: 'hsl(38, 92%, 50%)',
  Medium: 'hsl(207, 90%, 54%)',
  Low: 'hsl(142, 76%, 36%)',
};

const STATUS_COLORS: Record<string, string> = {
  Open: 'hsl(0, 65%, 51%)',
  'Under Investigation': 'hsl(38, 92%, 50%)',
  Resolved: 'hsl(207, 90%, 54%)',
  Closed: 'hsl(142, 76%, 36%)',
};

const POSTURE_VARIANT: Record<string, string> = {
  Elevated: 'destructive',
  'Under Review': 'warning',
  Stable: 'primary',
  Reduced: 'success',
};

const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const POSTURE_OPTIONS = ['Elevated', 'Stable', 'Reduced', 'Under Review'];

function exportIncidentsCsv(rows: any[]) {
  const headers = ['Reference', 'Event Date', 'Title', 'Linked Risk', 'Owner', 'Severity', 'Status', 'Posture', 'Response (days)', 'Financial Impact'];
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach((e: any) => {
    const owner = e.owner || e.reporter;
    const eventDate = e.event_date || e.occurred_at;
    const resolutionDate = e.resolution_date || e.resolved_at;
    const resp = eventDate && resolutionDate
      ? differenceInDays(new Date(resolutionDate), new Date(eventDate))
      : '';
    lines.push([
      e.reference_number || '',
      eventDate ? format(new Date(eventDate), 'yyyy-MM-dd') : '',
      e.title || '',
      e.risks?.title || '',
      owner?.full_name || owner?.email || '',
      e.severity || '',
      e.status || '',
      e.risk_posture || '',
      resp,
      e.financial_impact ?? e.impact_amount ?? '',
    ].map(esc).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incidents_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


export default function IncidentsDashboard() {
  const [timeRange, setTimeRange] = useState('12');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAllDialog, setShowAllDialog] = useState(false);
  const [editingIncident, setEditingIncident] = useState<any | null>(null);
  const [dialogDefaultTab, setDialogDefaultTab] = useState<'details' | 'history'>('details');
  const [allTableRows, setAllTableRows] = useState<any[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canAddIncident = hasPermission('add_risk') || hasPermission('edit_risks') || hasPermission('manage_continuity') || hasPermission('*');
  const canEditIncident = canAddIncident;

  // Detail filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [postureFilter, setPostureFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['risk-events-dashboard'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('risk_events')
        .select('*, risks(title, category, department)')
        .order('event_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      const evs = rows || [];

      // Hydrate reporter + owner profiles (no FK between risk_events and profiles)
      const ids = Array.from(
        new Set(
          evs
            .flatMap((e: any) => [e.reported_by, (e as any).owner_id])
            .filter(Boolean)
        )
      );
      let profileMap: Record<string, { user_id: string; full_name: string | null; email: string | null }> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', ids);
        (profs || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }
      return evs.map((e: any) => {
        const ownerId = (e as any).owner_id || e.reported_by;
        return {
          ...e,
          reporter: e.reported_by ? profileMap[e.reported_by] || null : null,
          owner: ownerId ? profileMap[ownerId] || null : null,
        };
      });
    },
  });

  // Deep-link: open the dialog when navigated with ?view=<id>&tab=<details|history>&entry=<audit_id>
  const [highlightEntryId, setHighlightEntryId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || !events.length) return;
    if (editingIncident?.id === viewId) return;
    const target = events.find((e: any) => e.id === viewId);
    if (target) {
      const tab = (searchParams.get('tab') as 'details' | 'history') || 'details';
      setDialogDefaultTab(tab === 'history' ? 'history' : 'details');
      setHighlightEntryId(searchParams.get('entry') || undefined);
      setEditingIncident(target);
    }
  }, [searchParams, events, editingIncident?.id]);

  // Owner options derived from current dataset (uses explicit owner_id, falling back to reporter)
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((e: any) => {
      const o = e.owner || e.reporter;
      const uid = o?.user_id || (e as any).owner_id || e.reported_by;
      if (uid) map.set(uid, o?.full_name || o?.email || 'Unknown');
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const cutoff = subMonths(new Date(), parseInt(timeRange));
    return events.filter((e: any) => {
      const dateStr = e.event_date || e.occurred_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (d < cutoff) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      if (postureFilter !== 'all' && e.risk_posture !== postureFilter) return false;
      if (ownerFilter !== 'all') {
        const ownerId = (e as any).owner_id || e.reported_by;
        if (ownerId !== ownerFilter) return false;
      }
      return true;
    });
  }, [events, timeRange, severityFilter, postureFilter, ownerFilter, dateFrom, dateTo]);

  const activeFilterCount =
    (severityFilter !== 'all' ? 1 : 0) +
    (postureFilter !== 'all' ? 1 : 0) +
    (ownerFilter !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const clearAllFilters = () => {
    setSeverityFilter('all');
    setPostureFilter('all');
    setOwnerFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // KPI metrics
  const metrics = useMemo(() => {
    const total = filteredEvents.length;
    const open = filteredEvents.filter((e: any) => e.status === 'Open' || e.status === 'Under Investigation').length;
    const resolved = filteredEvents.filter((e: any) => e.status === 'Resolved' || e.status === 'Closed');
    const totalFinancial = filteredEvents.reduce((sum: number, e: any) => sum + (Number(e.financial_impact) || 0), 0);

    // Avg response time (days between event_date and resolution_date for resolved events)
    const responseTimes = resolved
      .filter((e: any) => e.resolution_date)
      .map((e: any) => differenceInDays(new Date(e.resolution_date), new Date(e.event_date)));
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    // Avg discovery lag (days between event_date and discovered_date)
    const discoveryLags = filteredEvents
      .filter((e: any) => e.discovered_date && e.event_date)
      .map((e: any) => differenceInDays(new Date(e.discovered_date), new Date(e.event_date)));
    const avgDiscoveryLag = discoveryLags.length > 0
      ? Math.round(discoveryLags.reduce((a: number, b: number) => a + b, 0) / discoveryLags.length)
      : 0;

    return { total, open, resolved: resolved.length, totalFinancial, avgResponseTime, avgDiscoveryLag };
  }, [filteredEvents]);

  // Severity breakdown for pie chart
  const severityData = useMemo(() => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    filteredEvents.forEach((e: any) => { counts[e.severity] = (counts[e.severity] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  // Monthly trend
  const trendData = useMemo(() => {
    const months: Record<string, number> = {};
    const n = parseInt(timeRange);
    for (let i = n - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      months[format(d, 'MMM yyyy')] = 0;
    }
    filteredEvents.forEach((e: any) => {
      const key = format(startOfMonth(new Date(e.event_date)), 'MMM yyyy');
      if (key in months) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month, count }));
  }, [filteredEvents, timeRange]);

  // Status breakdown for bar chart
  const statusData = useMemo(() => {
    const counts: Record<string, number> = { Open: 0, 'Under Investigation': 0, Resolved: 0, Closed: 0 };
    filteredEvents.forEach((e: any) => { counts[e.status] = (counts[e.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  // Response time distribution by month
  const responseTimeData = useMemo(() => {
    const n = parseInt(timeRange);
    const months: Record<string, { total: number; count: number }> = {};
    for (let i = n - 1; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      months[format(d, 'MMM yyyy')] = { total: 0, count: 0 };
    }
    filteredEvents
      .filter((e: any) => e.resolution_date)
      .forEach((e: any) => {
        const key = format(startOfMonth(new Date(e.event_date)), 'MMM yyyy');
        if (key in months) {
          const days = differenceInDays(new Date(e.resolution_date), new Date(e.event_date));
          months[key].total += days;
          months[key].count++;
        }
      });
    return Object.entries(months).map(([month, { total, count }]) => ({
      month,
      avgDays: count > 0 ? Math.round(total / count) : 0,
    }));
  }, [filteredEvents, timeRange]);

  // Posture breakdown
  const postureData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredEvents.forEach((e: any) => {
      counts[e.risk_posture] = (counts[e.risk_posture] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredEvents]);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-destructive" />
            Incidents Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aggregated view of all crystallized risk events, response metrics, and trends
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canAddIncident && (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Incident
            </Button>
          )}
          <ExportIncidentsMenu incidents={filteredEvents} />
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 24 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <AddIncidentDialog
        open={showAddDialog || !!editingIncident}
        onOpenChange={(o) => {
          if (!o) {
            setShowAddDialog(false);
            setEditingIncident(null);
            setDialogDefaultTab('details');
            setHighlightEntryId(undefined);
            if (searchParams.has('view') || searchParams.has('tab') || searchParams.has('entry')) {
              const next = new URLSearchParams(searchParams);
              next.delete('view');
              next.delete('tab');
              next.delete('entry');
              setSearchParams(next, { replace: true });
            }
          }
        }}
        incident={editingIncident}
        defaultTab={dialogDefaultTab}
        highlightEntryId={highlightEntryId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['risk-events-dashboard'] })}
      />

      {/* Detail Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-2">
              <Filter className="w-4 h-4" /> Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
              )}
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {SEVERITY_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs">Posture</Label>
              <Select value={postureFilter} onValueChange={setPostureFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All postures</SelectItem>
                  {POSTURE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-xs">Owner / Reporter</Label>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="all">All owners</SelectItem>
                  {ownerOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[150px] justify-start font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[150px] justify-start font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd MMM yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Total Events
            </div>
            <div className="text-2xl font-bold">{metrics.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-destructive text-xs font-medium mb-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Open
            </div>
            <div className="text-2xl font-bold text-destructive">{metrics.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-success text-xs font-medium mb-1">
              <Activity className="w-3.5 h-3.5" /> Resolved
            </div>
            <div className="text-2xl font-bold text-success">{metrics.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Clock className="w-3.5 h-3.5" /> Avg Resolution
            </div>
            <div className="text-2xl font-bold">{metrics.avgResponseTime}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <CalendarDays className="w-3.5 h-3.5" /> Avg Discovery Lag
            </div>
            <div className="text-2xl font-bold">{metrics.avgDiscoveryLag}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-warning text-xs font-medium mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> Financial Impact
            </div>
            <div className="text-xl font-bold">₦{metrics.totalFinancial.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incident Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Incident Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 65%, 51%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 65%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="hsl(0, 65%, 51%)" fill="url(#trendGrad)" name="Incidents" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Severity Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Severity Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#888'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Avg Response Time Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" /> Avg Resolution Time (days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip />
                <Line type="monotone" dataKey="avgDays" stroke="hsl(207, 90%, 54%)" strokeWidth={2} dot={{ r: 3 }} name="Avg Days" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Event Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Count">
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#888'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Incidents Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Recent Incidents</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Showing latest {Math.min(10, filteredEvents.length)} of {filteredEvents.length} in the selected period
              {canEditIncident && ' · click a row to edit'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAllDialog(true)}>
            View all incidents
          </Button>
        </CardHeader>
        <CardContent>
          <IncidentsTable
            incidents={filteredEvents}
            canEdit={canEditIncident}
            onRowClick={(e) => { setDialogDefaultTab('details'); setEditingIncident(e); }}
            onOpen={(e, tab) => { setDialogDefaultTab(tab); setEditingIncident(e); }}
            initialPageSize={10}
            urlKey="rec"
          />
        </CardContent>
      </Card>

      {/* All Incidents dialog */}
      <Dialog open={showAllDialog} onOpenChange={setShowAllDialog}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span>All incidents ({events.length})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportIncidentsCsv(allTableRows.length ? allTableRows : events)}
                disabled={events.length === 0}
              >
                Export CSV
              </Button>
            </DialogTitle>
          </DialogHeader>
          <IncidentsTable
            incidents={events}
            canEdit={canEditIncident}
            onRowClick={(e) => { setShowAllDialog(false); setDialogDefaultTab('details'); setEditingIncident(e); }}
            onOpen={(e, tab) => { setShowAllDialog(false); setDialogDefaultTab(tab); setEditingIncident(e); }}
            showFilters
            showPagination
            initialPageSize={25}
            storageKey="incidents.allTable"
            urlKey="all"
            onDisplayRowsChange={setAllTableRows}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
