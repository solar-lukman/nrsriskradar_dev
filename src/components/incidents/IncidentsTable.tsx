import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Search, History, Eye,
} from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';

const POSTURE_VARIANT: Record<string, string> = {
  Elevated: 'destructive',
  'Under Review': 'warning',
  Stable: 'primary',
  Reduced: 'success',
};

const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const STATUS_OPTIONS = ['Open', 'Under Investigation', 'Resolved', 'Closed'];
const POSTURE_OPTIONS = ['Elevated', 'Stable', 'Reduced', 'Under Review'];

type SortField =
  | 'reference_number' | 'event_date' | 'title' | 'owner' | 'severity'
  | 'status' | 'risk_posture' | 'response' | 'financial_impact';
type SortDir = 'asc' | 'desc';

interface IncidentsTableProps {
  incidents: any[];
  canEdit?: boolean;
  onRowClick?: (incident: any) => void;
  /** Open with a specific dialog tab (used by row-action buttons). */
  onOpen?: (incident: any, tab: 'details' | 'history') => void;
  /** Show search + status/severity/posture filters + page size selector. */
  showFilters?: boolean;
  /** Show pagination controls. */
  showPagination?: boolean;
  /** Rows per page when pagination is disabled or as initial value. */
  initialPageSize?: number;
  /** localStorage key prefix for persisting page size. */
  storageKey?: string;
  /**
   * When set, table state (search, filters, sort, page) is synced to the URL
   * with this prefix. Multiple tables on one page must use different prefixes.
   */
  urlKey?: string;
  /** Callback with the currently displayed (filtered + sorted) rows. */
  onDisplayRowsChange?: (rows: any[]) => void;
}

export function IncidentsTable({
  incidents,
  canEdit,
  onRowClick,
  onOpen,
  showFilters = false,
  showPagination = false,
  initialPageSize = 10,
  storageKey,
  urlKey,
  onDisplayRowsChange,
}: IncidentsTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Prefixed URL param helpers
  const p = (name: string) => (urlKey ? `${urlKey}_${name}` : name);

  const readParam = (name: string, fallback: string) =>
    urlKey ? (searchParams.get(p(name)) ?? fallback) : fallback;

  const [search, setSearch] = useState<string>(() => readParam('q', ''));
  const [severity, setSeverity] = useState<string>(() => readParam('sev', 'all'));
  const [status, setStatus] = useState<string>(() => readParam('st', 'all'));
  const [posture, setPosture] = useState<string>(() => readParam('po', 'all'));
  const [sortField, setSortField] = useState<SortField>(
    () => (readParam('sf', 'event_date') as SortField)
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (readParam('sd', 'desc') as SortDir)
  );
  const [page, setPage] = useState<number>(() => {
    const raw = parseInt(readParam('pg', '1'), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    const urlSize = urlKey ? parseInt(readParam('ps', ''), 10) : NaN;
    if (Number.isFinite(urlSize) && [10, 25, 50, 100].includes(urlSize)) return urlSize;
    if (!storageKey || typeof window === 'undefined') return initialPageSize;
    const saved = localStorage.getItem(`${storageKey}.pageSize`);
    const n = saved ? parseInt(saved, 10) : initialPageSize;
    return [10, 25, 50, 100].includes(n) ? n : initialPageSize;
  });

  useEffect(() => {
    if (storageKey) {
      try { localStorage.setItem(`${storageKey}.pageSize`, String(pageSize)); } catch { /* ignore */ }
    }
  }, [pageSize, storageKey]);

  // Sync state → URL (only for the params we own; leave the rest untouched).
  useEffect(() => {
    if (!urlKey) return;
    const next = new URLSearchParams(searchParams);
    const setOrDel = (name: string, value: string, isDefault: boolean) => {
      if (isDefault) next.delete(p(name));
      else next.set(p(name), value);
    };
    setOrDel('q', search, search === '');
    setOrDel('sev', severity, severity === 'all');
    setOrDel('st', status, status === 'all');
    setOrDel('po', posture, posture === 'all');
    setOrDel('sf', sortField, sortField === 'event_date');
    setOrDel('sd', sortDir, sortDir === 'desc');
    setOrDel('pg', String(page), page === 1);
    setOrDel('ps', String(pageSize), pageSize === initialPageSize);
    // Only push if anything actually changed
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, severity, status, posture, sortField, sortDir, page, pageSize, urlKey]);

  // Reset to first page when filters/data change (but keep URL-persisted page on first load).
  const dataLen = incidents.length;
  useEffect(() => { setPage(1); }, [search, severity, status, posture, sortField, sortDir, pageSize, dataLen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter((e: any) => {
      if (severity !== 'all' && e.severity !== severity) return false;
      if (status !== 'all' && e.status !== status) return false;
      if (posture !== 'all' && e.risk_posture !== posture) return false;
      if (!q) return true;
      const owner = e.owner || e.reporter;
      const ownerName = owner?.full_name || owner?.email || '';
      return (
        (e.reference_number || '').toLowerCase().includes(q) ||
        (e.title || '').toLowerCase().includes(q) ||
        (e.risks?.title || '').toLowerCase().includes(q) ||
        ownerName.toLowerCase().includes(q) ||
        (e.status || '').toLowerCase().includes(q) ||
        (e.severity || '').toLowerCase().includes(q)
      );
    });
  }, [incidents, search, severity, status, posture]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = getSortValue(a, sortField);
      const bv = getSortValue(b, sortField);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [filtered, sortField, sortDir]);

  useEffect(() => {
    onDisplayRowsChange?.(sorted);
  }, [sorted, onDisplayRowsChange]);

  const total = sorted.length;
  const totalPages = showPagination ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const start = showPagination ? (currentPage - 1) * pageSize : 0;
  const pageRows = showPagination ? sorted.slice(start, start + pageSize) : sorted.slice(0, pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  const openRow = (event: any, tab: 'details' | 'history') => {
    if (onOpen) onOpen(event, tab);
    else if (canEdit) onRowClick?.(event);
  };

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search incidents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-9"
            />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITY_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={posture} onValueChange={setPosture}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Posture" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All postures</SelectItem>
              {POSTURE_OPTIONS.map(po => <SelectItem key={po} value={po}>{po}</SelectItem>)}
            </SelectContent>
          </Select>
          {showPagination && (
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground bg-muted/30">
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('reference_number')}>Ref{sortIcon('reference_number')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('event_date')}>Date{sortIcon('event_date')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('title')}>Title / Risk{sortIcon('title')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('owner')}>Owner{sortIcon('owner')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('severity')}>Severity{sortIcon('severity')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('risk_posture')}>Posture{sortIcon('risk_posture')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('response')}>Response Time{sortIcon('response')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('financial_impact')}>Financial Impact{sortIcon('financial_impact')}</th>
              <th className="p-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((event: any) => {
              const eventDate = event.event_date || event.occurred_at;
              const resolutionDate = event.resolution_date || event.resolved_at;
              const respDays = resolutionDate && eventDate
                ? differenceInDays(new Date(resolutionDate), new Date(eventDate))
                : null;
              const fin = event.financial_impact ?? event.impact_amount;
              const owner = event.owner || event.reporter;
              return (
                <tr
                  key={event.id}
                  className={cn(
                    'border-b border-border/50 hover:bg-muted/40 transition-colors',
                    canEdit && 'cursor-pointer'
                  )}
                  onClick={() => { if (canEdit) openRow(event, 'details'); }}
                >
                  <td className="p-2 pr-4 whitespace-nowrap font-mono text-xs text-muted-foreground">{event.reference_number || '—'}</td>
                  <td className="p-2 pr-4 whitespace-nowrap">{eventDate ? format(new Date(eventDate), 'dd MMM yyyy') : '—'}</td>
                  <td className="p-2 pr-4 max-w-[240px] truncate">
                    <div className="font-medium truncate">{event.title || '—'}</div>
                    {event.risks?.title && (
                      <div className="text-xs text-muted-foreground truncate">↳ {event.risks.title}</div>
                    )}
                  </td>
                  <td className="p-2 pr-4 whitespace-nowrap text-xs">
                    {owner ? (owner.full_name || owner.email || '—') : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2 pr-4">
                    <Badge variant={event.severity === 'Critical' ? 'destructive' : event.severity === 'High' ? 'warning' as any : 'secondary'}>
                      {event.severity}
                    </Badge>
                  </td>
                  <td className="p-2 pr-4"><Badge variant="outline">{event.status}</Badge></td>
                  <td className="p-2 pr-4">
                    <Badge variant={(POSTURE_VARIANT[event.risk_posture] || 'secondary') as any}>
                      {event.risk_posture}
                    </Badge>
                  </td>
                  <td className="p-2 pr-4 whitespace-nowrap">
                    {respDays !== null ? `${respDays} days` : <span className="text-muted-foreground">Ongoing</span>}
                  </td>
                  <td className="p-2 pr-4 whitespace-nowrap">
                    {fin ? `₦${Number(fin).toLocaleString()}` : '—'}
                  </td>
                  <td className="p-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                        onClick={() => openRow(event, 'details')}
                        title="Open incident details"
                      >
                        <Eye className="w-3.5 h-3.5" /> Open
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                        onClick={() => openRow(event, 'history')}
                        title="Open activity timeline"
                      >
                        <History className="w-3.5 h-3.5" /> Timeline
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  No incidents match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={currentPage === 1} onClick={() => setPage(pp => Math.max(1, pp - 1))}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <span className="px-2">Page {currentPage} of {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(pp => Math.min(totalPages, pp + 1))}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getSortValue(row: any, field: SortField): any {
  switch (field) {
    case 'event_date': return row.event_date || row.occurred_at || null;
    case 'owner': {
      const o = row.owner || row.reporter;
      return (o?.full_name || o?.email || '').toLowerCase();
    }
    case 'severity': {
      const rank: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
      return rank[row.severity] ?? 0;
    }
    case 'response': {
      const eventDate = row.event_date || row.occurred_at;
      const resolutionDate = row.resolution_date || row.resolved_at;
      if (!eventDate || !resolutionDate) return null;
      return differenceInDays(new Date(resolutionDate), new Date(eventDate));
    }
    case 'financial_impact':
      return Number(row.financial_impact ?? row.impact_amount ?? 0);
    default:
      return (row[field] ?? '').toString().toLowerCase();
  }
}
