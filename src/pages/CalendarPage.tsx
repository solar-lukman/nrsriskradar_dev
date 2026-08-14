import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths, addDays, isWithinInterval, startOfDay } from 'date-fns';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import {
  CalendarIcon, Clock, AlertTriangle, ShieldCheck, FileText, ListTodo, RefreshCw,
  ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type EventKind = 'risk_review' | 'treatment_task' | 'bcp_test' | 'scheduled_report';

interface CalEvent {
  id: string;
  kind: EventKind;
  date: Date;
  title: string;
  subtitle?: string;
  href?: string;
  overdue?: boolean;
  meta?: string;
}

const KIND_META: Record<EventKind, { label: string; icon: React.ElementType; color: string; dot: string; chip: string }> = {
  risk_review:      { label: 'Risk Review',      icon: ShieldCheck, color: 'text-primary',     dot: 'bg-primary',     chip: 'bg-primary/10 text-primary border-primary/20' },
  treatment_task:   { label: 'Treatment Task',   icon: ListTodo,    color: 'text-warning',     dot: 'bg-warning',     chip: 'bg-warning/10 text-warning border-warning/20' },
  bcp_test:         { label: 'BCP Test',         icon: AlertTriangle, color: 'text-destructive', dot: 'bg-destructive', chip: 'bg-destructive/10 text-destructive border-destructive/20' },
  scheduled_report: { label: 'Scheduled Report', icon: FileText,    color: 'text-accent-foreground', dot: 'bg-accent-foreground', chip: 'bg-muted text-foreground border-border' },
};

const ALL_KINDS: EventKind[] = ['risk_review', 'treatment_task', 'bcp_test', 'scheduled_report'];

export default function CalendarPage() {
  const [month, setMonth] = useState<Date>(startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(new Set(ALL_KINDS));

  const loadEvents = async () => {
    setLoading(true);
    // Fetch a wide window so prev/next month nav stays snappy
    const windowStart = subMonths(startOfMonth(month), 1).toISOString();
    const windowEnd = addMonths(endOfMonth(month), 2).toISOString();
    const windowStartDate = windowStart.split('T')[0];
    const windowEndDate = windowEnd.split('T')[0];

    const [risksRes, tasksRes, bcpRes, bcpTestsRes, schedRes] = await Promise.all([
      supabase.from('risks').select('id, title, review_date').not('review_date', 'is', null)
        .gte('review_date', windowStartDate).lte('review_date', windowEndDate),
      (supabase as any).from('risk_mitigation_tasks').select('id, title, due_date, status, risk_id').not('due_date', 'is', null)
        .gte('due_date', windowStartDate).lte('due_date', windowEndDate),
      supabase.from('business_continuity_plans').select('id, title, next_test_date, department').not('next_test_date', 'is', null)
        .gte('next_test_date', windowStartDate).lte('next_test_date', windowEndDate),
      (supabase as any).from('bcp_tests')
        .select('id, bcp_id, test_type, test_status, scheduled_date, business_continuity_plans(title, department)')
        .eq('test_status', 'Scheduled').not('scheduled_date', 'is', null)
        .gte('scheduled_date', windowStartDate).lte('scheduled_date', windowEndDate),
      supabase.from('report_schedules').select('id, title, next_run_at, frequency, is_active').eq('is_active', true)
        .gte('next_run_at', windowStart).lte('next_run_at', windowEnd),
    ]);

    const now = new Date();
    const list: CalEvent[] = [];

    (risksRes.data || []).forEach((r: any) => {
      const d = new Date(r.review_date);
      list.push({
        id: `risk-${r.id}`, kind: 'risk_review', date: d,
        title: r.title, subtitle: 'Risk review due',
        href: `/risk-register`,
        overdue: d < now,
      });
    });

    (tasksRes.data || []).forEach((t: any) => {
      if (t.status === 'completed' || t.status === 'cancelled') return;
      const d = new Date(t.due_date);
      list.push({
        id: `task-${t.id}`, kind: 'treatment_task', date: d,
        title: t.title, subtitle: `Treatment task · ${t.status}`,
        href: `/risk-register`,
        overdue: d < now,
      });
    });

    const scheduledKeys = new Set<string>();
    ((bcpTestsRes as any)?.data || []).forEach((t: any) => {
      const d = new Date(t.scheduled_date);
      const plan = t.business_continuity_plans || {};
      scheduledKeys.add(`${t.bcp_id}-${t.scheduled_date}`);
      list.push({
        id: `bcptest-${t.id}`, kind: 'bcp_test', date: d,
        title: plan.title || 'Continuity test',
        subtitle: `${t.test_type || 'BCP test'} · ${plan.department || ''}`,
        href: `/business-continuity/${t.bcp_id}/edit`,
        overdue: d < now,
      });
    });

    (bcpRes.data || []).forEach((b: any) => {
      if (scheduledKeys.has(`${b.id}-${b.next_test_date}`)) return;
      const d = new Date(b.next_test_date);
      list.push({
        id: `bcp-${b.id}`, kind: 'bcp_test', date: d,
        title: b.title, subtitle: `BCP test · ${b.department || ''}`,
        href: `/business-continuity`,
        overdue: d < now,
      });
    });

    (schedRes.data || []).forEach((s: any) => {
      const d = new Date(s.next_run_at);
      list.push({
        id: `sched-${s.id}`, kind: 'scheduled_report', date: d,
        title: s.title, subtitle: `${s.frequency} report`,
        href: `/board-reports`,
        overdue: d < now,
      });
    });

    setEvents(list);
    setLoading(false);
  };

  useEffect(() => { loadEvents(); /* eslint-disable-next-line */ }, [month]);

  const filtered = useMemo(() => events.filter(e => activeKinds.has(e.kind)), [events, activeKinds]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    filtered.forEach(e => {
      const k = format(e.date, 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return m;
  }, [filtered]);

  const selectedDayEvents = useMemo(
    () => filtered.filter(e => isSameDay(e.date, selectedDate)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [filtered, selectedDate]
  );

  const upcoming = useMemo(() => {
    const now = new Date();
    const horizon = addDays(now, 14);
    return filtered
      .filter(e => isWithinInterval(e.date, { start: now, end: horizon }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 8);
  }, [filtered]);

  const overdue = useMemo(
    () => filtered.filter(e => e.overdue).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 8),
    [filtered]
  );

  const kpis = useMemo(() => {
    const monthInterval = { start: startOfMonth(month), end: endOfMonth(month) };
    const inMonth = filtered.filter(e => isWithinInterval(e.date, monthInterval));
    const counts: Record<EventKind, number> = { risk_review: 0, treatment_task: 0, bcp_test: 0, scheduled_report: 0 };
    inMonth.forEach(e => { counts[e.kind]++; });
    return { total: inMonth.length, counts, overdueCount: filtered.filter(e => e.overdue).length };
  }, [filtered, month]);

  const toggleKind = (k: EventKind) => {
    setActiveKinds(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <CalendarIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Risk Operations Calendar</h1>
              <p className="text-sm text-muted-foreground">
                Live view of risk reviews, treatment deadlines, BCP tests, and scheduled reports.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiTile label={`Events in ${format(month, 'MMM')}`} value={kpis.total} icon={CalendarIcon} accent="primary" />
          <KpiTile label="Risk reviews" value={kpis.counts.risk_review} icon={ShieldCheck} accent="primary" />
          <KpiTile label="Treatment tasks" value={kpis.counts.treatment_task} icon={ListTodo} accent="warning" />
          <KpiTile label="Overdue" value={kpis.overdueCount} icon={AlertTriangle} accent={kpis.overdueCount > 0 ? 'destructive' : 'muted'} />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {ALL_KINDS.map(k => {
            const meta = KIND_META[k];
            const active = activeKinds.has(k);
            const Icon = meta.icon;
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  active ? meta.chip : 'bg-muted/40 text-muted-foreground border-border opacity-60 hover:opacity-100'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                <Icon className="w-3 h-3" />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">{format(month, 'MMMM yyyy')}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setMonth(new Date()); setSelectedDate(new Date()); }}>
                  Today
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                month={month}
                onMonthChange={setMonth}
                showOutsideDays
                className="w-full pointer-events-auto"
                classNames={{
                  months: 'w-full',
                  month: 'w-full space-y-4',
                  table: 'w-full border-collapse',
                  head_row: 'flex w-full',
                  head_cell: 'text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center',
                  row: 'flex w-full mt-2',
                  cell: 'flex-1 h-16 p-0.5 relative',
                  day: 'h-full w-full p-1 font-normal text-sm rounded-md hover:bg-accent flex flex-col items-start justify-start',
                  day_selected: 'bg-primary text-primary-foreground hover:bg-primary',
                  day_today: 'ring-1 ring-primary/40',
                }}
                components={{
                  DayContent: ({ date }) => {
                    const dayEvents = eventsByDay.get(format(date, 'yyyy-MM-dd')) || [];
                    return (
                      <div className="flex flex-col items-start w-full h-full">
                        <span className="text-xs">{date.getDate()}</span>
                        {dayEvents.length > 0 && (
                          <div className="mt-auto flex flex-wrap gap-0.5 pb-0.5">
                            {dayEvents.slice(0, 4).map((e, i) => (
                              <span key={i} className={cn('w-1.5 h-1.5 rounded-full', KIND_META[e.kind].dot, e.overdue && 'ring-1 ring-destructive')} />
                            ))}
                            {dayEvents.length > 4 && (
                              <span className="text-[9px] text-muted-foreground leading-none">+{dayEvents.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  },
                }}
              />
            </CardContent>
          </Card>

          {/* Side panel: selected day + upcoming/overdue */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {format(selectedDate, 'EEE, MMM d')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No events on this day</p>
                ) : (
                  selectedDayEvents.map(e => <EventRow key={e.id} event={e} />)
                )}
              </CardContent>
            </Card>

            <UpcomingPanel loading={loading} items={upcoming} emptyText="Nothing scheduled in the next 14 days" />

            {overdue.length > 0 && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" /> Overdue
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overdue.map(e => <EventRow key={e.id} event={e} />)}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function KpiTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent: 'primary' | 'warning' | 'destructive' | 'muted' }) {
  const accentMap = {
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted text-muted-foreground',
  } as const;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', accentMap[accent])}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: CalEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const body = (
    <div className={cn(
      'group flex items-start gap-3 p-2.5 rounded-md border transition-colors',
      event.overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border hover:bg-accent/40'
    )}>
      <div className={cn('mt-0.5 p-1.5 rounded-md shrink-0', meta.chip)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium truncate">{event.title}</p>
          {event.href && <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{format(event.date, 'MMM d, h:mma')}</span>
          {event.overdue && <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">Overdue</Badge>}
        </div>
        {event.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{event.subtitle}</p>}
      </div>
    </div>
  );
  return event.href ? <Link to={event.href}>{body}</Link> : body;
}

function UpcomingPanel({ loading, items, emptyText }: { loading: boolean; items: CalEvent[]; emptyText: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" /> Next 14 days
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">{emptyText}</p>
        ) : (
          items.map(e => <EventRow key={e.id} event={e} />)
        )}
      </CardContent>
    </Card>
  );
}
