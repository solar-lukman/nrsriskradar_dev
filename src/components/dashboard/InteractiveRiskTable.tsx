import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, ArrowUpDown, ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import type { Tables } from '@/integrations/supabase/types';

type Risk = Tables<'risks'>;

interface InteractiveRiskTableProps {
  risks: Risk[];
  onRiskClick?: (risk: Risk) => void;
}

type SortField = 'title' | 'category' | 'department' | 'status' | 'inherent_score' | 'residual_score' | 'created_at';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_KEY = 'reports.tablePageSize';

export function InteractiveRiskTable({ risks, onRiskClick }: InteractiveRiskTableProps) {
  const [sortField, setSortField] = useState<SortField>('residual_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(PAGE_SIZE_KEY) : null;
    const parsed = saved ? parseInt(saved, 10) : 10;
    return [10, 25, 50].includes(parsed) ? parsed : 10;
  });

  // Persist page size
  useEffect(() => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)); } catch {}
  }, [pageSize]);

  // Reset to first page when source data or filters change
  useEffect(() => { setPage(1); }, [risks.length, tableSearch, sortField, sortDirection, pageSize]);

  const filtered = useMemo(() => {
    if (!tableSearch.trim()) return risks;
    const q = tableSearch.toLowerCase();
    return risks.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q)
    );
  }, [risks, tableSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aValue: any = (a as any)[sortField];
      let bValue: any = (b as any)[sortField];
      if (sortField === 'inherent_score') {
        aValue = a.inherent_likelihood * a.inherent_impact;
        bValue = b.inherent_likelihood * b.inherent_impact;
      } else if (sortField === 'residual_score') {
        aValue = a.residual_likelihood * a.residual_impact;
        bValue = b.residual_likelihood * b.residual_impact;
      }
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortDirection]);

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(startIdx, startIdx + pageSize);
  const showingFrom = totalCount === 0 ? 0 : startIdx + 1;
  const showingTo = Math.min(startIdx + pageSize, totalCount);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 opacity-50" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    const variant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      'New': 'secondary',
      'In Review': 'outline',
      'Mitigated': 'default',
      'Escalated': 'destructive',
    };
    return <Badge variant={variant[status] ?? 'outline'} className="text-xs">{status}</Badge>;
  };

  const getRiskScoreBadge = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    const severity = score >= 15 ? 'high' : score >= 10 ? 'medium' : 'low';
    const colors = {
      high: 'bg-destructive text-destructive-foreground',
      medium: 'bg-warning text-warning-foreground',
      low: 'bg-success text-success-foreground',
    };
    return <Badge className={`text-xs ${colors[severity]}`}>{score}</Badge>;
  };

  const getMitigationProgress = (inherentScore: number, residualScore: number) => {
    if (inherentScore === 0) return 0;
    return Math.max(0, Math.round(((inherentScore - residualScore) / inherentScore) * 100));
  };

  // Build a small windowed page list
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const window = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - window && i <= currentPage + window)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }
    return pages;
  }, [totalPages, currentPage]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <span>Risks</span>
            <Badge variant="secondary">{totalCount} {tableSearch ? 'matched' : 'total'}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search in table…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-7 h-9 w-[200px]"
              />
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('title')}>
                  <div className="flex items-center gap-2">Risk Title {getSortIcon('title')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('category')}>
                  <div className="flex items-center gap-2">Category {getSortIcon('category')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('department')}>
                  <div className="flex items-center gap-2">Department {getSortIcon('department')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('inherent_score')}>
                  <div className="flex items-center gap-2">Inherent {getSortIcon('inherent_score')}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('residual_score')}>
                  <div className="flex items-center gap-2">Residual {getSortIcon('residual_score')}</div>
                </TableHead>
                <TableHead>Mitigation</TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-2">Status {getSortIcon('status')}</div>
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    No risks match the current filters.
                  </TableCell>
                </TableRow>
              ) : pageRows.map((risk) => {
                const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
                const residualScore = risk.residual_likelihood * risk.residual_impact;
                const mitigationProgress = getMitigationProgress(inherentScore, residualScore);
                return (
                  <TableRow
                    key={risk.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onRiskClick?.(risk)}
                  >
                    <TableCell className="font-medium max-w-[240px] truncate">{risk.title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{risk.category}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{risk.department || 'N/A'}</TableCell>
                    <TableCell>{getRiskScoreBadge(risk.inherent_likelihood, risk.inherent_impact)}</TableCell>
                    <TableCell>{getRiskScoreBadge(risk.residual_likelihood, risk.residual_impact)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={mitigationProgress} className="flex-1 h-2" />
                        <span className="text-xs text-muted-foreground">{mitigationProgress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(risk.status)}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setSelectedRisk(risk); }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>{selectedRisk?.title}</DialogTitle>
                          </DialogHeader>
                          {selectedRisk && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Category</label>
                                  <p className="text-sm text-muted-foreground">{selectedRisk.category}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Department</label>
                                  <p className="text-sm text-muted-foreground">{selectedRisk.department || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Status</label>
                                  <div className="mt-1">{getStatusBadge(selectedRisk.status)}</div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Created</label>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(selectedRisk.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Description</label>
                                <p className="text-sm text-muted-foreground mt-1">{selectedRisk.description}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Inherent Risk</label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">L: {selectedRisk.inherent_likelihood}</span>
                                    <span className="text-sm">I: {selectedRisk.inherent_impact}</span>
                                    {getRiskScoreBadge(selectedRisk.inherent_likelihood, selectedRisk.inherent_impact)}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Residual Risk</label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">L: {selectedRisk.residual_likelihood}</span>
                                    <span className="text-sm">I: {selectedRisk.residual_impact}</span>
                                    {getRiskScoreBadge(selectedRisk.residual_likelihood, selectedRisk.residual_impact)}
                                  </div>
                                </div>
                              </div>
                              {selectedRisk.mitigation_plan && (
                                <div>
                                  <label className="text-sm font-medium">Mitigation Plan</label>
                                  <p className="text-sm text-muted-foreground mt-1">{selectedRisk.mitigation_plan}</p>
                                </div>
                              )}
                              {selectedRisk.review_date && (
                                <div>
                                  <label className="text-sm font-medium">Next Review Date</label>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {new Date(selectedRisk.review_date).toLocaleDateString()}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{showingFrom}</span>–
            <span className="font-medium text-foreground">{showingTo}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount}</span>
            {tableSearch && ` (filtered from ${risks.length})`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            {pageNumbers.map((p, i) =>
              p === 'ellipsis' ? (
                <span key={`e-${i}`} className="px-2 text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? 'default' : 'ghost'}
                  size="sm"
                  className="min-w-9"
                  onClick={() => setPage(p)}
                >{p}</Button>
              )
            )}
            <Button
              variant="ghost" size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
