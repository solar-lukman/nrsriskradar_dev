import React from 'react';
import { Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RiskFiltersProps {
  filters: {
    department: string;
    owner: string;
    category: string;
    status: string;
    search: string;
    riskType: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  departments: string[];
  owners: string[];
  categories: string[];
  statuses: string[];
}

export function RiskFilters({
  filters,
  onFilterChange,
  onClearFilters,
  departments,
  owners,
  categories,
  statuses,
}: RiskFiltersProps) {
  const hasActiveFilters = Object.entries(filters).some(([key, value]) =>
    key === 'search' ? value !== '' : value !== 'all'
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filters
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Department</label>
          <Select value={filters.department} onValueChange={(value) => onFilterChange('department', value)}>
            <SelectTrigger>
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Risk Owner</label>
          <Select value={filters.owner} onValueChange={(value) => onFilterChange('owner', value)}>
            <SelectTrigger>
              <SelectValue placeholder="All Owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map((owner) => (
                <SelectItem key={owner} value={owner}>
                  {owner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Category</label>
          <Select value={filters.category} onValueChange={(value) => onFilterChange('category', value)}>
            <SelectTrigger>
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Status</label>
          <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground mb-2">Active Filters:</div>
            <div className="space-y-1">
              {filters.department && filters.department !== 'all' && (
                <div className="text-xs bg-muted px-2 py-1 rounded">
                  Department: {filters.department}
                </div>
              )}
              {filters.owner && filters.owner !== 'all' && (
                <div className="text-xs bg-muted px-2 py-1 rounded">
                  Owner: {filters.owner}
                </div>
              )}
              {filters.category && filters.category !== 'all' && (
                <div className="text-xs bg-muted px-2 py-1 rounded">
                  Category: {filters.category}
                </div>
              )}
              {filters.status && filters.status !== 'all' && (
                <div className="text-xs bg-muted px-2 py-1 rounded">
                  Status: {filters.status}
                </div>
              )}
              {filters.search && (
                <div className="text-xs bg-muted px-2 py-1 rounded">
                  Search: "{filters.search}"
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
