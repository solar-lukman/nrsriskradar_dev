import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestFinding {
  description: string;
  severity: string;
  recommendation: string;
}

export type TestErrors = Partial<Record<'testType' | 'testScope' | 'testResults', string>>;

interface TestDetailsSectionProps {
  testType: string;
  setTestType: (v: string) => void;
  testScope: string;
  setTestScope: (v: string) => void;
  testResults: string;
  setTestResults: (v: string) => void;
  testFindings: TestFinding[];
  setTestFindings: (v: TestFinding[]) => void;
  errors?: TestErrors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

export function TestDetailsSection({
  testType, setTestType,
  testScope, setTestScope,
  testResults, setTestResults,
  testFindings, setTestFindings,
  errors = {},
}: TestDetailsSectionProps) {
  const [open, setOpen] = React.useState(false);
  const hasError = Object.values(errors).some(Boolean);

  React.useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

  const addFinding = () => {
    setTestFindings([...testFindings, { description: '', severity: 'Medium', recommendation: '' }]);
  };

  const updateFinding = (index: number, field: keyof TestFinding, value: string) => {
    const updated = [...testFindings];
    updated[index] = { ...updated[index], [field]: value };
    setTestFindings(updated);
  };

  const removeFinding = (index: number) => {
    setTestFindings(testFindings.filter((_, i) => i !== index));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-full justify-between', hasError && 'border-destructive text-destructive')}
        >
          Test Details{hasError ? ' — fix errors below' : ''}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Test Type</Label>
            <Select value={testType} onValueChange={setTestType}>
              <SelectTrigger className={errors.testType ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select test type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tabletop Exercise">Tabletop Exercise</SelectItem>
                <SelectItem value="Walkthrough">Walkthrough</SelectItem>
                <SelectItem value="Simulation">Simulation</SelectItem>
                <SelectItem value="Full Test">Full Test</SelectItem>
              </SelectContent>
            </Select>
            <FieldError message={errors.testType} />
          </div>
          <div className="space-y-2">
            <Label>Test Scope</Label>
            <Input
              value={testScope}
              onChange={(e) => setTestScope(e.target.value)}
              placeholder="Scope of the test exercise"
              className={errors.testScope ? 'border-destructive' : ''}
            />
            <FieldError message={errors.testScope} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Test Results</Label>
          <Textarea
            value={testResults}
            onChange={(e) => setTestResults(e.target.value)}
            placeholder="Summary of test results and observations..."
            rows={3}
            className={errors.testResults ? 'border-destructive' : ''}
          />
          <FieldError message={errors.testResults} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Test Findings</Label>
            <Button type="button" variant="outline" size="sm" onClick={addFinding}>
              <Plus className="w-4 h-4 mr-1" /> Add Finding
            </Button>
          </div>
          {testFindings.map((finding, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium">Finding {index + 1}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeFinding(index)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Input
                value={finding.description}
                onChange={(e) => updateFinding(index, 'description', e.target.value)}
                placeholder="Finding description"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Select value={finding.severity} onValueChange={(v) => updateFinding(index, 'severity', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={finding.recommendation}
                  onChange={(e) => updateFinding(index, 'recommendation', e.target.value)}
                  placeholder="Recommendation"
                />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
