import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DashboardFiltersProps {
  onFilterChange: (filters: {
    startDate?: Date;
    endDate?: Date;
    department?: string;
    owner?: string;
  }) => void;
}

interface Owner {
  user_id: string;
  full_name: string;
}

export function DashboardFilters({ onFilterChange }: DashboardFiltersProps) {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [department, setDepartment] = useState<string>('');
  const [owner, setOwner] = useState<string>('');
  const [owners, setOwners] = useState<Owner[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    onFilterChange({
      startDate,
      endDate,
      department: department || undefined,
      owner: owner || undefined
    });
  }, [startDate, endDate, department, owner, onFilterChange]);

  const fetchFilterOptions = async () => {
    try {
      // Fetch unique departments
      const { data: deptData } = await supabase
        .from('risks')
        .select('department')
        .not('department', 'is', null);
      
      const uniqueDepts = [...new Set(deptData?.map(r => r.department).filter(Boolean))] as string[];
      setDepartments(uniqueDepts);

      // Fetch owners
      const { data: ownerData, error: ownerError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .not('full_name', 'is', null);
      
      if (ownerError) {
        console.error('Owners fetch error:', ownerError);
        setOwners([]); // Set empty array on error
      } else {
        setOwners(ownerData || []);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setDepartment('');
    setOwner('');
  };

  const hasActiveFilters = startDate || endDate || department || owner;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <Label className="font-medium">Filters:</Label>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">From:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM dd") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Label className="text-sm">To:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "MMM dd") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Department:</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Owner Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Owner:</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All owners</SelectItem>
                {owners.map((ownerOption) => (
                  <SelectItem key={ownerOption.user_id} value={ownerOption.user_id}>
                    {ownerOption.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}