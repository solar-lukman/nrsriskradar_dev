import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface BCPlan {
  id: string;
  department: string;
  status: string;
  test_status: string;
  business_function: string;
  owner_profile?: {
    full_name: string;
  };
}

interface BCPFiltersProps {
  plans: BCPlan[];
  onFilter: (filteredPlans: BCPlan[]) => void;
}

export function BCPFilters({ plans, onFilter }: BCPFiltersProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedTestStatus, setSelectedTestStatus] = useState<string>('');
  const [selectedFunction, setSelectedFunction] = useState<string>('');

  // Get unique values for filter options
  const departments = [...new Set(plans.map(p => p.department))].sort();
  const statuses = [...new Set(plans.map(p => p.status))].sort();
  const testStatuses = [...new Set(plans.map(p => p.test_status))].sort();
  const businessFunctions = [...new Set(plans.map(p => p.business_function))].sort();

  useEffect(() => {
    filterPlans();
  }, [selectedDepartment, selectedStatus, selectedTestStatus, selectedFunction, plans]);

  const filterPlans = () => {
    let filtered = plans;

    if (selectedDepartment) {
      filtered = filtered.filter(plan => plan.department === selectedDepartment);
    }

    if (selectedStatus) {
      filtered = filtered.filter(plan => plan.status === selectedStatus);
    }

    if (selectedTestStatus) {
      filtered = filtered.filter(plan => plan.test_status === selectedTestStatus);
    }

    if (selectedFunction) {
      filtered = filtered.filter(plan => plan.business_function === selectedFunction);
    }

    onFilter(filtered);
  };

  const clearFilters = () => {
    setSelectedDepartment('');
    setSelectedStatus('');
    setSelectedTestStatus('');
    setSelectedFunction('');
  };

  const activeFiltersCount = [selectedDepartment, selectedStatus, selectedTestStatus, selectedFunction]
    .filter(Boolean).length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Needs Review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Outdated':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTestStatusColor = (status: string) => {
    switch (status) {
      case 'Passed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Failed':
      case 'Overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Not Tested':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Filter Controls */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm">Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      <Badge className={getStatusColor(status)} variant="outline">
                        {status}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Test Status</Label>
              <Select value={selectedTestStatus} onValueChange={setSelectedTestStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All test statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All test statuses</SelectItem>
                  {testStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      <Badge className={getTestStatusColor(status)} variant="outline">
                        {status}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Business Function</Label>
              <Select value={selectedFunction} onValueChange={setSelectedFunction}>
                <SelectTrigger>
                  <SelectValue placeholder="All functions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All functions</SelectItem>
                  {businessFunctions.map((func) => (
                    <SelectItem key={func} value={func}>
                      {func}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              
              {selectedDepartment && (
                <Badge variant="secondary" className="gap-1">
                  Department: {selectedDepartment}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedDepartment('')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              )}

              {selectedStatus && (
                <Badge variant="secondary" className="gap-1">
                  Status: {selectedStatus}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedStatus('')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              )}

              {selectedTestStatus && (
                <Badge variant="secondary" className="gap-1">
                  Test: {selectedTestStatus}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedTestStatus('')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              )}

              {selectedFunction && (
                <Badge variant="secondary" className="gap-1">
                  Function: {selectedFunction}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setSelectedFunction('')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              )}

              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}