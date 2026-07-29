import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarIcon, Filter, X, Search, RotateCcw, ChevronDown } from 'lucide-react';
import { format, subDays, subMonths, startOfQuarter, endOfQuarter } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DashboardFiltersProps {
  onFilterChange: (filters: {
    startDate?: Date;
    endDate?: Date;
    department?: string;
    owner?: string;
    search?: string;
    status?: string;
    severity?: string;
  }) => void;
}

interface Owner {
  user_id: string;
  full_name: string;
}

const DATE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This Quarter', custom: 'quarter' },
  { label: 'Last 6 months', months: 6 },
  { label: 'This Year', custom: 'year' },
];

export function AdvancedDashboardFilters({ onFilterChange }: DashboardFiltersProps) {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [department, setDepartment] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [status, setStatus] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [owners, setOwners] = useState<Owner[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Keep latest onFilterChange in a ref so we don't loop when parent passes a new function each render
  const onFilterChangeRef = useRef(onFilterChange);
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    onFilterChangeRef.current({
      startDate,
      endDate,
      department: department === 'all' ? undefined : department,
      owner: owner === 'all' ? undefined : owner,
      search: search || undefined,
      status: status === 'all' ? undefined : status,
      severity: severity === 'all' ? undefined : severity,
    });
  }, [startDate, endDate, department, owner, search, status, severity]);

  const fetchFilterOptions = async () => {
    try {
      // Fetch departments from canonical departments table
      const { data: deptData } = await supabase
        .from('departments')
        .select('name')
        .eq('is_active', true)
        .order('name');

      let deptList = (deptData || []).map((d: any) => d.name).filter(Boolean) as string[];

      // Merge in any departments referenced by existing risks (in case lookup is incomplete)
      const { data: riskDepts } = await supabase
        .from('risks')
        .select('department')
        .not('department', 'is', null);
      const fromRisks = (riskDepts || []).map((r: any) => r.department).filter(Boolean) as string[];
      deptList = Array.from(new Set([...deptList, ...fromRisks])).sort((a, b) => a.localeCompare(b));
      setDepartments(deptList);

      // Fetch owners — derive from risks visible to the user, then resolve names from profiles.
      // (profiles RLS hides other users from non-admins, so we first try the broad query,
      //  then fall back to deriving the owner set from accessible risks.)
      const { data: ownerData } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .not('full_name', 'is', null)
        .order('full_name');

      if (ownerData && ownerData.length > 1) {
        setOwners(ownerData as Owner[]);
      } else {
        const { data: ownerRisks } = await supabase
          .from('risks')
          .select('owner_id')
          .not('owner_id', 'is', null);
        const ownerIds = Array.from(new Set((ownerRisks || []).map((r: any) => r.owner_id).filter(Boolean)));
        if (ownerIds.length > 0) {
          const { data: ownerProfiles } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', ownerIds);
          const merged = [...(ownerData || []), ...(ownerProfiles || [])];
          const dedup = Array.from(new Map(merged.map((p: any) => [p.user_id, p])).values()) as Owner[];
          setOwners(dedup.filter(o => o.full_name).sort((a, b) => a.full_name.localeCompare(b.full_name)));
        } else {
          setOwners((ownerData || []) as Owner[]);
        }
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setDepartment('all');
    setOwner('all');
    setSearch('');
    setStatus('all');
    setSeverity('all');
  };

  const applyDatePreset = (preset: typeof DATE_PRESETS[0]) => {
    const now = new Date();
    
    if (preset.days) {
      setStartDate(subDays(now, preset.days));
      setEndDate(now);
    } else if (preset.months) {
      setStartDate(subMonths(now, preset.months));
      setEndDate(now);
    } else if (preset.custom === 'quarter') {
      setStartDate(startOfQuarter(now));
      setEndDate(endOfQuarter(now));
    } else if (preset.custom === 'year') {
      setStartDate(new Date(now.getFullYear(), 0, 1));
      setEndDate(new Date(now.getFullYear(), 11, 31));
    }
  };

  const hasActiveFilters = startDate || endDate || (department !== 'all') || (owner !== 'all') || search || (status !== 'all') || (severity !== 'all');
  const activeFilterCount = [
    startDate, 
    endDate, 
    department !== 'all' ? department : null, 
    owner !== 'all' ? owner : null, 
    search, 
    status !== 'all' ? status : null, 
    severity !== 'all' ? severity : null
  ].filter(Boolean).length;

  const [open, setOpen] = useState(false);

  // Auto-expand when a filter becomes active (e.g. via card click)
  useEffect(() => {
    if (hasActiveFilters) setOpen(true);
    // Intentionally only react to count change — we don't want to fight the user collapsing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilterCount > 0]);

  const chips = hasActiveFilters && (
    <div className="flex flex-wrap items-center gap-1.5">
      {search && (
        <Badge variant="secondary" className="text-xs">
          Search: "{search}"
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSearch(''); }} />
        </Badge>
      )}
      {status !== 'all' && (
        <Badge variant="secondary" className="text-xs">
          Status: {status}
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setStatus('all'); }} />
        </Badge>
      )}
      {severity !== 'all' && (
        <Badge variant="secondary" className="text-xs">
          Severity: {severity}
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSeverity('all'); }} />
        </Badge>
      )}
      {department !== 'all' && (
        <Badge variant="secondary" className="text-xs">
          Dept: {department}
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setDepartment('all'); }} />
        </Badge>
      )}
      {owner !== 'all' && (
        <Badge variant="secondary" className="text-xs">
          Owner
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setOwner('all'); }} />
        </Badge>
      )}
      {(startDate || endDate) && (
        <Badge variant="secondary" className="text-xs">
          Date Range
          <X className="w-3 h-3 ml-1 cursor-pointer" onClick={(e) => {
            e.stopPropagation();
            setStartDate(undefined);
            setEndDate(undefined);
          }} />
        </Badge>
      )}
    </div>
  );

  return (
    <Card className="border-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          {/* Header (always visible) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-left flex-1 min-w-0 hover:opacity-80 transition-opacity"
                aria-label={open ? 'Collapse filters' : 'Expand filters'}
              >
                <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                <Filter className="w-4 h-4 text-primary" />
                <Label className="font-semibold text-sm cursor-pointer">Advanced Filters</Label>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeFilterCount} active
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>

            {/* Inline chips when collapsed so the user sees what's applied */}
            {!open && chips}

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            )}
          </div>

          <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className="space-y-4 pt-4">
              {/* Search */}
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search risks by title or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* Main Filters */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Date Range with Presets */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date Range</Label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {DATE_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => applyDatePreset(preset)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn('flex-1 justify-start text-left font-normal', !startDate && 'text-muted-foreground')}
                        >
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {startDate ? format(startDate, 'MMM dd') : 'From'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn('flex-1 justify-start text-left font-normal', !endDate && 'text-muted-foreground')}
                        >
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {endDate ? format(endDate, 'MMM dd') : 'To'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Submitted">Submitted</SelectItem>
                      <SelectItem value="In Review">In Review</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Mitigated">Mitigated</SelectItem>
                      <SelectItem value="Escalated">Escalated</SelectItem>
                      <SelectItem value="Crystallized">Crystallized</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity Filter */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Risk Severity</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger><SelectValue placeholder="All severities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All severities</SelectItem>
                      <SelectItem value="high">High (15+)</SelectItem>
                      <SelectItem value="medium">Medium (10-14)</SelectItem>
                      <SelectItem value="low">Low (1-9)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Department Filter */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Department</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Owner Filter - Full Width */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Risk Owner</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All owners</SelectItem>
                    {owners.map((ownerOption) => (
                      <SelectItem key={ownerOption.user_id} value={ownerOption.user_id}>
                        {ownerOption.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active Filters Display (when expanded) */}
              {hasActiveFilters && (
                <div className="pt-2 border-t">{chips}</div>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}