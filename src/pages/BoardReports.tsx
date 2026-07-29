import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Download, FileText, Calendar, Eye, AlertTriangle, Briefcase, Loader2,
  Clock, Archive, Search, MoreHorizontal, PlayCircle, PauseCircle,
  CalendarClock, History, Sparkles, ShieldCheck, Activity, Gauge,
  RefreshCw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useBoardReports } from '@/hooks/useBoardReports';
import { BoardReportPreviewDialog } from '@/components/board-reports/BoardReportPreviewDialog';
import { ScheduleReportDialog } from '@/components/board-reports/ScheduleReportDialog';
import { ReportArchivePanel } from '@/components/board-reports/ReportArchivePanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ReportType = 'quarterly' | 'annual' | 'emergency' | 'compliance' | 'kri';
type Period = 'this-quarter' | 'this-year' | 'last-30';

interface ReportDef {
  id: number;
  title: string;
  description: string;
  type: ReportType;
  typeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind border color class
  iconBg: string;
}

const reports: ReportDef[] = [
  { id: 1, title: 'Quarterly Risk Assessment', description: 'Comprehensive risk overview with category breakdown, control effectiveness, and top risks', type: 'quarterly', typeLabel: 'Quarterly', icon: Gauge, accent: 'border-l-primary', iconBg: 'bg-primary/10 text-primary' },
  { id: 2, title: 'Annual Risk Management Review', description: 'Year-end effectiveness assessment including budget utilization and BCP readiness', type: 'annual', typeLabel: 'Annual', icon: ShieldCheck, accent: 'border-l-secondary', iconBg: 'bg-secondary/40 text-secondary-foreground' },
  { id: 3, title: 'Emergency Response Readiness', description: 'Business continuity and crisis management with BCP coverage and escalated risks', type: 'emergency', typeLabel: 'Emergency', icon: AlertTriangle, accent: 'border-l-destructive', iconBg: 'bg-destructive/10 text-destructive' },
  { id: 4, title: 'Regulatory Compliance Status', description: 'Compliance-category risks, controls, and status breakdown', type: 'compliance', typeLabel: 'Compliance', icon: FileText, accent: 'border-l-warning', iconBg: 'bg-warning/10 text-warning' },
  { id: 5, title: 'Key Risk Indicators Dashboard', description: 'KRI trends, severity distribution, threshold breaches, and risk reduction metrics', type: 'kri', typeLabel: 'KRI', icon: Activity, accent: 'border-l-success', iconBg: 'bg-success/10 text-success' },
];

const PERIOD_LABELS: Record<Period, string> = {
  'this-quarter': 'This Quarter',
  'this-year': 'This Year',
  'last-30': 'Last 30 Days',
};

function periodToWindow(p: Period): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const end = now;
  let start: Date;
  if (p === 'this-quarter') {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
  } else if (p === 'this-year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = new Date(now.getTime() - 30 * 86400000);
  }
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - span);
  return { start, end, prevStart, prevEnd };
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const m = Math.round(abs / 60000);
  if (m < 1) return future ? 'in a moment' : 'just now';
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return future ? `in ${d}d` : `${d}d ago`;
  const mo = Math.round(d / 30);
  return future ? `in ${mo}mo` : `${mo}mo ago`;
}

interface Archive {
  id: string;
  title: string;
  report_type: string;
  generated_at: string;
  generated_by: string | null;
  metadata: any;
  content: any;
}
interface Schedule {
  id: string;
  title: string;
  report_type: string;
  frequency: string;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  recipients: any;
}

type DrillMode = null | 'generated' | 'active' | 'overdue';
type RefreshInterval = 'off' | '30s' | '60s' | '5m';
const REFRESH_MS: Record<RefreshInterval, number> = { off: 0, '30s': 30000, '60s': 60000, '5m': 300000 };

export default function BoardReports() {
  const { user, hasPermission } = useAuth();
  const [period, setPeriod] = useState<Period>('this-quarter');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDefaultType, setScheduleDefaultType] = useState<string | undefined>(undefined);
  const [archiveKey, setArchiveKey] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');
  const [archives, setArchives] = useState<Archive[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [drill, setDrill] = useState<DrillMode>(null);
  const [autoRefresh, setAutoRefresh] = useState<RefreshInterval>('60s');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const recentRef = React.useRef<HTMLDivElement>(null);
  const upcomingRef = React.useRef<HTMLDivElement>(null);

  const { loading, sections, activeReport, generateReport, downloadPDF } = useBoardReports();

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    const [a, s] = await Promise.all([
      supabase.from('board_report_archives').select('*').order('generated_at', { ascending: false }).limit(50),
      supabase.from('report_schedules').select('*').order('next_run_at', { ascending: true }),
    ]);
    setArchives(((a.data as any[]) || []) as Archive[]);
    setSchedules(((s.data as any[]) || []) as Schedule[]);
    setLoadingMeta(false);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta, archiveKey]);

  useEffect(() => {
    const ms = REFRESH_MS[autoRefresh];
    if (!ms) return;
    const id = setInterval(() => { loadMeta(); }, ms);
    return () => clearInterval(id);
  }, [autoRefresh, loadMeta]);

  const drillTo = useCallback((mode: DrillMode) => {
    setDrill(mode);
    setTimeout(() => {
      const el = mode === 'generated' ? recentRef.current : upcomingRef.current;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const window = useMemo(() => periodToWindow(period), [period]);

  const stats = useMemo(() => {
    const inWindow = archives.filter(a => {
      const t = new Date(a.generated_at).getTime();
      return t >= window.start.getTime() && t <= window.end.getTime();
    });
    const inPrev = archives.filter(a => {
      const t = new Date(a.generated_at).getTime();
      return t >= window.prevStart.getTime() && t <= window.prevEnd.getTime();
    });
    const activeSched = schedules.filter(s => s.is_active);
    const overdue = activeSched.filter(s => new Date(s.next_run_at).getTime() < Date.now());
    const nextRun = activeSched
      .filter(s => new Date(s.next_run_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime())[0];
    const last = archives[0];
    return {
      generated: inWindow.length,
      delta: inWindow.length - inPrev.length,
      activeSchedules: activeSched.length,
      overdue: overdue.length,
      nextRun,
      last,
    };
  }, [archives, schedules, window]);

  const lastByType = useMemo(() => {
    const map = new Map<string, Archive>();
    for (const a of archives) {
      if (!map.has(a.report_type)) map.set(a.report_type, a);
    }
    return map;
  }, [archives]);

  const scheduleByType = useMemo(() => {
    const map = new Map<string, Schedule>();
    for (const s of schedules.filter(x => x.is_active).sort((a, b) =>
      new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime())) {
      if (!map.has(s.report_type)) map.set(s.report_type, s);
    }
    return map;
  }, [schedules]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (q && !`${r.title} ${r.description}`.toLowerCase().includes(q)) return false;
      return true;
     });
  }, [search, typeFilter]);

  const recentArchives = useMemo(() => {
    if (drill === 'generated') {
      return archives.filter(a => {
        const t = new Date(a.generated_at).getTime();
        return t >= window.start.getTime() && t <= window.end.getTime();
      }).slice(0, 10);
    }
    return archives.slice(0, 5);
  }, [archives, drill, window]);
  const upcomingRuns = useMemo(() => {
    const active = schedules.filter(s => s.is_active);
    if (drill === 'overdue') return active.filter(s => new Date(s.next_run_at).getTime() < Date.now());
    if (drill === 'active') return active.slice(0, 10);
    return active.slice(0, 5);
  }, [schedules, drill]);

  // === Permission guard AFTER all hooks ===
  if (!hasPermission('board_oversight')) {
    return (
      <Card className="max-w-2xl mx-auto mt-12">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Access Restricted</CardTitle>
              <CardDescription>Board reports are limited to executive risk oversight roles.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Roles with access: <strong>CRO</strong>, <strong>RMD</strong>, <strong>ERMSC</strong>, <strong>EC</strong>, <strong>RCB</strong>, and <strong>ADMIN</strong>.</p>
          <p>If you believe you should have access, please contact your administrator.</p>
        </CardContent>
      </Card>
    );
  }

  const handlePreview = async (report: ReportDef) => {
    setPreviewOpen(true);
    await generateReport(report.type, report.title, PERIOD_LABELS[period]);
  };

  const handleArchiveAndDownload = async () => {
    if (!activeReport || !user) return;
    try {
      await supabase.functions.invoke('scheduled-reports', {
        body: {
          action: 'generate',
          reportType: activeReport.title.toLowerCase().includes('quarterly') ? 'quarterly'
            : activeReport.title.toLowerCase().includes('annual') ? 'annual'
            : activeReport.title.toLowerCase().includes('emergency') ? 'emergency'
            : activeReport.title.toLowerCase().includes('compliance') ? 'compliance'
            : 'kri',
          title: activeReport.title,
          period: activeReport.period,
          userId: user.id,
          sendEmail: false,
        },
      });
      toast.success('Report archived');
      setArchiveKey(k => k + 1);
    } catch {
      // continue with download even if archive fails
    }
    downloadPDF(activeReport.title, activeReport.period, sections);
    toast.success('PDF downloaded');
  };

  const openSchedule = (defaultType?: string) => {
    setScheduleDefaultType(defaultType);
    setScheduleOpen(true);
  };

  const runScheduleNow = async (s: Schedule) => {
    const def = reports.find(r => r.type === s.report_type);
    if (!def) return;
    setPreviewOpen(true);
    await generateReport(def.type, def.title, PERIOD_LABELS[period]);
  };

  const toggleSchedule = async (s: Schedule) => {
    const { error } = await supabase
      .from('report_schedules')
      .update({ is_active: !s.is_active } as any)
      .eq('id', s.id);
    if (error) toast.error('Failed to update schedule');
    else {
      toast.success(s.is_active ? 'Schedule paused' : 'Schedule resumed');
      setArchiveKey(k => k + 1);
    }
  };

  const previewArchive = async (a: Archive) => {
    const def = reports.find(r => r.type === a.report_type);
    if (!def) return;
    setPreviewOpen(true);
    await generateReport(def.type, def.title, PERIOD_LABELS[period]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="w-8 h-8" />
            Board Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Executive and board-level risk reports — generated from live data.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-quarter">This Quarter</SelectItem>
              <SelectItem value="this-year">This Year</SelectItem>
              <SelectItem value="last-30">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={autoRefresh} onValueChange={(v) => setAutoRefresh(v as RefreshInterval)}>
            <SelectTrigger className="w-[150px]" title={`Last refreshed ${relativeTime(lastRefreshed)}`}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Manual refresh</SelectItem>
              <SelectItem value="30s">Every 30s</SelectItem>
              <SelectItem value="60s">Every 60s</SelectItem>
              <SelectItem value="5m">Every 5 min</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={loadMeta} title={`Refresh now · last ${relativeTime(lastRefreshed)}`}>
            <RefreshCw className={cn('w-4 h-4', loadingMeta && 'animate-spin')} />
          </Button>
          <Button variant="outline" onClick={() => openSchedule()}>
            <Clock className="w-4 h-4 mr-2" />
            Schedule Report
          </Button>
        </div>
      </div>

      {drill && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm">
          <span className="text-muted-foreground">Drill-down:</span>
          <Badge variant="secondary" className="capitalize">
            {drill === 'generated' ? `Reports in ${PERIOD_LABELS[period]}` : drill === 'overdue' ? 'Overdue schedules' : 'All active schedules'}
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => setDrill(null)}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Live KPI strip */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card
          className="cursor-pointer hover:bg-muted/30 transition"
          onClick={() => drillTo('generated')}
          title={`See the ${stats.generated} report${stats.generated === 1 ? '' : 's'} generated in ${PERIOD_LABELS[period]}`}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reports generated</p>
                <p className="text-2xl font-bold mt-1">{loadingMeta ? '—' : stats.generated}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {PERIOD_LABELS[period]}
                  {!loadingMeta && stats.delta !== 0 && (
                    <span className={cn('ml-2', stats.delta > 0 ? 'text-success' : 'text-destructive')}>
                      {stats.delta > 0 ? '▲' : '▼'} {Math.abs(stats.delta)} vs prior
                    </span>
                  )}
                </p>
              </div>
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/30 transition"
          onClick={() => drillTo('active')}
          title="See all active schedules"
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active schedules</p>
                <p className="text-2xl font-bold mt-1">{loadingMeta ? '—' : stats.activeSchedules}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {stats.nextRun
                    ? `Next: ${stats.nextRun.title.slice(0, 22)} · ${relativeTime(new Date(stats.nextRun.next_run_at))}`
                    : 'No upcoming runs'}
                </p>
              </div>
              <CalendarClock className="h-7 w-7 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className={stats.last ? 'cursor-pointer hover:bg-muted/30 transition' : ''} onClick={() => stats.last && previewArchive(stats.last)}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last report</p>
                <p className="text-base font-semibold mt-1 truncate">
                  {stats.last ? stats.last.title : 'None yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.last ? relativeTime(new Date(stats.last.generated_at)) : 'Generate one to begin'}
                </p>
              </div>
              <Sparkles className="h-7 w-7 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn('cursor-pointer hover:bg-muted/30 transition', stats.overdue > 0 && 'border-destructive/40')}
          onClick={() => drillTo('overdue')}
          title="See overdue schedules"
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overdue schedules</p>
                <p className={cn('text-2xl font-bold mt-1', stats.overdue > 0 && 'text-destructive')}>
                  {loadingMeta ? '—' : stats.overdue}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.overdue > 0 ? 'Run now from Upcoming below' : 'All on track'}
                </p>
              </div>
              <AlertTriangle className={cn('h-7 w-7', stats.overdue > 0 ? 'text-destructive' : 'text-muted-foreground')} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Generate Reports
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            History & Schedules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reports…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'quarterly', 'annual', 'emergency', 'compliance', 'kri'] as const).map(t => (
                <Button
                  key={t}
                  size="sm"
                  variant={typeFilter === t ? 'default' : 'outline'}
                  onClick={() => setTypeFilter(t)}
                  className="capitalize h-8"
                >
                  {t === 'kri' ? 'KRI' : t}
                </Button>
              ))}
            </div>
          </div>

          {/* Report cards grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {filteredReports.map(report => {
              const Icon = report.icon;
              const last = lastByType.get(report.type);
              const sched = scheduleByType.get(report.type);
              return (
                <Card key={report.id} className={cn('border-l-4 transition hover:shadow-md', report.accent)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={cn('p-2 rounded-lg shrink-0', report.iconBg)}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base leading-tight">{report.title}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-xs">{report.typeLabel}</Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openSchedule(report.type)}>
                            <Clock className="w-4 h-4 mr-2" />
                            Schedule…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handlePreview(report)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{report.description}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />
                        {last ? `Last: ${relativeTime(new Date(last.generated_at))}` : 'Never generated'}
                      </span>
                      {sched && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" />
                          Next: {relativeTime(new Date(sched.next_run_at))}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePreview(report)} disabled={loading}>
                        {loading && activeReport?.title === report.title
                          ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          : <Eye className="w-4 h-4 mr-2" />}
                        Preview
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => handlePreview(report)} disabled={loading}>
                        <Download className="w-4 h-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredReports.length === 0 && (
              <Card className="md:col-span-2">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No reports match your filters.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent activity + Upcoming runs */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card ref={recentRef} className={cn(drill === 'generated' && 'ring-2 ring-primary/40')}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Recent activity
                </CardTitle>
                <CardDescription className="text-xs">
                  {drill === 'generated'
                    ? `Archives in ${PERIOD_LABELS[period]} (${recentArchives.length})`
                    : 'Last 5 archived reports'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentArchives.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No reports archived yet.</p>
                ) : recentArchives.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-md border hover:bg-muted/30 transition">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {a.report_type} · {relativeTime(new Date(a.generated_at))}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => previewArchive(a)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card ref={upcomingRef} className={cn((drill === 'active' || drill === 'overdue') && 'ring-2 ring-primary/40')}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Upcoming scheduled runs
                </CardTitle>
                <CardDescription className="text-xs">
                  {drill === 'overdue'
                    ? `Overdue schedules (${upcomingRuns.length})`
                    : drill === 'active'
                    ? `All active schedules (${upcomingRuns.length})`
                    : 'Next 5 active schedules'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingRuns.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-sm text-muted-foreground">No automated reports scheduled.</p>
                    <Button size="sm" variant="outline" onClick={() => openSchedule()}>
                      <Clock className="w-4 h-4 mr-2" />
                      Create schedule
                    </Button>
                  </div>
                ) : upcomingRuns.map(s => {
                  const overdue = new Date(s.next_run_at).getTime() < Date.now();
                  const recipientCount = Array.isArray(s.recipients) ? s.recipients.length : 0;
                  return (
                    <div key={s.id} className={cn('flex items-center justify-between gap-2 p-2 rounded-md border', overdue && 'border-destructive/40 bg-destructive/5')}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{s.title}</p>
                          <Badge variant="outline" className="text-xs capitalize">{s.frequency}</Badge>
                          {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {recipientCount > 0 && `${recipientCount} recipient${recipientCount === 1 ? '' : 's'} · `}
                          {relativeTime(new Date(s.next_run_at))}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => runScheduleNow(s)} title="Run now">
                          <PlayCircle className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule(s)} title={s.is_active ? 'Pause' : 'Resume'}>
                          <PauseCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="archive">
          <ReportArchivePanel key={archiveKey} />
        </TabsContent>
      </Tabs>

      <BoardReportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        reportTitle={activeReport?.title || ''}
        reportPeriod={activeReport?.period || ''}
        sections={sections}
        loading={loading}
        onDownloadPDF={handleArchiveAndDownload}
      />

      <ScheduleReportDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        defaultType={scheduleDefaultType}
        onScheduleCreated={() => setArchiveKey(k => k + 1)}
      />
    </div>
  );
}
