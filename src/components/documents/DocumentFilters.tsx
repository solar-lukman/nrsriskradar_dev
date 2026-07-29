import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface Document {
  document_type: string;
  status: string;
  department: string;
  owner_profile?: { full_name: string };
}

interface DocumentFiltersProps {
  documents: Document[];
  onFilter: (filteredDocuments: Document[]) => void;
}

export function DocumentFilters({ documents, onFilter }: DocumentFiltersProps) {
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');

  const documentTypes = [...new Set(documents.map(d => d.document_type))].sort();
  const statuses = [...new Set(documents.map(d => d.status))].sort();
  const departments = [...new Set(documents.map(d => d.department).filter(Boolean))].sort();

  React.useEffect(() => {
    filterDocuments();
  }, [selectedType, selectedStatus, selectedDepartment, documents]);

  const filterDocuments = () => {
    let filtered = documents;

    if (selectedType) {
      filtered = filtered.filter(doc => doc.document_type === selectedType);
    }

    if (selectedStatus) {
      filtered = filtered.filter(doc => doc.status === selectedStatus);
    }

    if (selectedDepartment) {
      filtered = filtered.filter(doc => doc.department === selectedDepartment);
    }

    onFilter(filtered);
  };

  const clearFilters = () => {
    setSelectedType('');
    setSelectedStatus('');
    setSelectedDepartment('');
  };

  const activeFiltersCount = [selectedType, selectedStatus, selectedDepartment]
    .filter(Boolean).length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-sm">Document Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All types</SelectItem>
                {documentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
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
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {selectedType && (
              <Badge variant="secondary" className="gap-1">
                Type: {selectedType}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 ml-1"
                  onClick={() => setSelectedType('')}
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
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}