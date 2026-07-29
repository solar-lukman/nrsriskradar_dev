import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Search, Eye, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';

const CRITICALITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const STATUS_OPTIONS = ['Ready', 'Needs Review', 'Outdated'];
const TEST_STATUS_OPTIONS = ['Not Tested', 'Passed', 'Failed', 'Overdue'];

type SortField =
  | 'title' | 'department' | 'business_function' | 'bia_criticality_rating'
  | 'bia_assessment_date' | 'status' | 'test_status' | 'recovery_time_objective'
  | 'last_updated_date';
type SortDir = 'asc' | 'desc';

interface BCPTableProps {
  plans: any[];
  onView?: (plan: any) => void;
  onEdit?: (plan: any) => void;
  showFilters?: boolean;
  showPagination?: boolean;
  initialPageSize?: number;
  storageKey?: string;
  urlKey?: string;
  onDisplayRowsChange?: (rows: any[]) => void;
}

const statusColor = (s: string) => {
  switch (s) {
    case 'Ready': return 'bg-green-100 text-green-800 border-green-200';
    case 'Needs Review': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'Outdated': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
const testStatusColor = (s: string) => {
  switch (s) {
    case 'Passed': return 'bg-green-100 text-green-800 border-green-200';
    case 'Failed':
    case 'Overdue': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
const criticalityColor = (c?: string) =>
  c === 'Critical' ? 'bg-red-100 text-red-800 border-red-200' :
  c === 'High' ? 'bg-orange-100 text-orange-800 border-orange-200' :
  c === 'Medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
  'bg-green-100 text-green-800 border-green-200';

export function BCPTable({
  plans,
  onView,
  onEdit,
  showFilters = false,
  showPagination = false,
  initialPageSize = 10,
  storageKey,
  urlKey,
  onDisplayRowsChange,
}: BCPTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const p = (name: string) => (urlKey ? `${urlKey}_${name}` : name);
  const readParam = (name: string, fallback: string) =>
    urlKey ? (searchParams.get(p(name)) ?? fallback) : fallback;

  const [search, setSearch] = useState<string>(() => readParam('q', ''));
  const [department, setDepartment] = useState<string>(() => readParam('dept', 'all'));
  const [criticality, setCriticality] = useState<string>(() => readParam('crit', 'all'));
  const [status, setStatus] = useState<string>(() => readParam('st', 'all'));
  const [testStatus, setTestStatus] = useState<string>(() => readParam('ts', 'all'));
  const [sortField, setSortField] = useState<SortField>(
    () => (readParam('sf', 'last_updated_date') as SortField)
  );
  const [sortDir, setSortDir] = useState<SortDir>(() => (readParam('sd', 'desc') as SortDir));
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

  useEffect(() => {
    if (!urlKey) return;
    const next = new URLSearchParams(searchParams);
    const setOrDel = (name: string, value: string, isDefault: boolean) => {
      if (isDefault) next.delete(p(name));
      else next.set(p(name), value);
    };
    setOrDel('q', search, search === '');
    setOrDel('dept', department, department === 'all');
    setOrDel('crit', criticality, criticality === 'all');
    setOrDel('st', status, status === 'all');
    setOrDel('ts', testStatus, testStatus === 'all');
    setOrDel('sf', sortField, sortField === 'last_updated_date');
    setOrDel('sd', sortDir, sortDir === 'desc');
    setOrDel('pg', String(page), page === 1);
    setOrDel('ps', String(pageSize), pageSize === initialPageSize);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, department, criticality, status, testStatus, sortField, sortDir, page, pageSize, urlKey]);

  const dataLen = plans.length;
  useEffect(() => { setPage(1); }, [search, department, criticality, status, testStatus, sortField, sortDir, pageSize, dataLen]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    plans.forEach((p: any) => { if (p.department) set.add(p.department); });
    return Array.from(set).sort();
  }, [plans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((pl: any) => {
      if (department !== 'all' && pl.department !== department) return false;
      if (criticality !== 'all' && (pl.bia_criticality_rating || 'Medium') !== criticality) return false;
      if (status !== 'all' && pl.status !== status) return false;
      if (testStatus !== 'all' && pl.test_status !== testStatus) return false;
      if (!q) return true;
      return (
        (pl.title || '').toLowerCase().includes(q) ||
        (pl.department || '').toLowerCase().includes(q) ||
        (pl.business_function || '').toLowerCase().includes(q)
      );
    });
  }, [plans, search, department, criticality, status, testStatus]);

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

  useEffect(() => { onDisplayRowsChange?.(sorted); }, [sorted, onDisplayRowsChange]);

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

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search plans…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-9"
            />
          </div>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={criticality} onValueChange={setCriticality}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Criticality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All criticality</SelectItem>
              {CRITICALITY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={testStatus} onValueChange={setTestStatus}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Test status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All test statuses</SelectItem>
              {TEST_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('title')}>Plan Title{sortIcon('title')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('department')}>Department{sortIcon('department')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('business_function')}>Business Function{sortIcon('business_function')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('bia_criticality_rating')}>Criticality{sortIcon('bia_criticality_rating')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('bia_assessment_date')}>BIA{sortIcon('bia_assessment_date')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('test_status')}>Test Status{sortIcon('test_status')}</th>
              <th className="p-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort('recovery_time_objective')}>RTO/RPO{sortIcon('recovery_time_objective')}</th>
              <th className="p-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((plan: any) => (
              <tr
                key={plan.id}
                className={cn('border-b border-border/50 hover:bg-muted/40 transition-colors', onView && 'cursor-pointer')}
                onClick={() => onView?.(plan)}
              >
                <td className="p-2 pr-4">
                  <div className="font-medium">{plan.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Updated: {plan.last_updated_date ? new Date(plan.last_updated_date).toLocaleDateString() : '—'}
                  </div>
                </td>
                <td className="p-2 pr-4">{plan.department}</td>
                <td className="p-2 pr-4">{plan.business_function}</td>
                <td className="p-2 pr-4">
                  <Badge className={criticalityColor(plan.bia_criticality_rating)}>
                    {plan.bia_criticality_rating || 'Medium'}
                  </Badge>
                </td>
                <td className="p-2 pr-4">
                  {plan.bia_assessment_date ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200">Complete</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800 border-gray-200">Pending</Badge>
                  )}
                </td>
                <td className="p-2 pr-4"><Badge className={statusColor(plan.status)}>{plan.status}</Badge></td>
                <td className="p-2 pr-4"><Badge className={testStatusColor(plan.test_status)}>{plan.test_status}</Badge></td>
                <td className="p-2 pr-4 whitespace-nowrap text-xs">
                  RTO: {plan.recovery_time_objective ?? 'N/A'}h<br />
                  RPO: {plan.recovery_point_objective ?? 'N/A'}h
                </td>
                <td className="p-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1">
                    {onView && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={() => onView(plan)}>
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                    )}
                    {onEdit && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={() => onEdit(plan)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  No business continuity plans match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
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
    case 'bia_criticality_rating': {
      const rank: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
      return rank[row.bia_criticality_rating || 'Medium'] ?? 0;
    }
    case 'bia_assessment_date':
    case 'last_updated_date':
      return row[field] ? new Date(row[field]).getTime() : null;
    case 'recovery_time_objective':
      return Number(row.recovery_time_objective ?? 0);
    default:
      return (row[field] ?? '').toString().toLowerCase();
  }
}

export function bcpRowsToCSV(rows: any[]): string {
  const headers = [
    'Title', 'Department', 'Business Function', 'Criticality', 'BIA Assessment Date',
    'Status', 'Test Status', 'RTO (h)', 'RPO (h)', 'Last Updated',
  ];
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push([
      r.title, r.department, r.business_function,
      r.bia_criticality_rating || 'Medium',
      r.bia_assessment_date || '',
      r.status, r.test_status,
      r.recovery_time_objective ?? '',
      r.recovery_point_objective ?? '',
      r.last_updated_date || '',
    ].map(escape).join(','));
  });
  return lines.join('\n');
}
