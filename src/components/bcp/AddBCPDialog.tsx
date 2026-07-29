import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Plus, X, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BIASection } from './BIASection';
import { TestDetailsSection } from './TestDetailsSection';
import { useDepartments } from '@/hooks/useDepartments';
import { mapBcpServerError } from '@/lib/bcpServerErrors';

const bcpAddSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  businessFunction: z.string().trim().min(1, 'Business function is required').max(200),
  description: z.string().max(2000).optional(),
  biaCriticalityRating: z.enum(['Critical', 'High', 'Medium', 'Low']),
  biaFinancialImpact: z.string().refine((v) => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), 'Financial impact must be a non-negative number'),
  biaOperationalImpact: z.string().max(2000).optional(),
  biaReputationalImpact: z.string().max(2000).optional(),
  biaRegulatoryImpact: z.string().max(2000).optional(),
  biaMaxTolerableDowntime: z.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 43800), 'MTD must be a non-negative integer (max 43800 hours)'),
  biaAssessmentDate: z.string().refine((v) => {
    if (v === '') return true;
    if (isNaN(Date.parse(v))) return false;
    return new Date(v) <= new Date(new Date().toISOString().split('T')[0]);
  }, 'Assessment date must be valid and not in the future'),
  testType: z.string().max(100).optional(),
  testScope: z.string().max(1000).optional(),
  testResults: z.string().max(4000).optional(),
});

interface AddBCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface MitigationAction {
  action: string;
  responsible: string;
  target_date: Date | null;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export function AddBCPDialog({ open, onOpenChange, onSuccess }: AddBCPDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<any[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const { departments } = useDepartments();
  const [ownerId, setOwnerId] = useState('');
  const [businessFunction, setBusinessFunction] = useState('');
  const [dependencies, setDependencies] = useState<string[]>(['']);
  const [mitigationActions, setMitigationActions] = useState<MitigationAction[]>([]);
  const [recoveryTimeObjective, setRecoveryTimeObjective] = useState('');
  const [recoveryPointObjective, setRecoveryPointObjective] = useState('');
  const [status, setStatus] = useState<'Ready' | 'Needs Review' | 'Outdated'>('Needs Review');
  const [testStatus, setTestStatus] = useState<'Not Tested' | 'Passed' | 'Failed' | 'Overdue'>('Not Tested');
  const [lastTestedDate, setLastTestedDate] = useState<Date>();
  const [nextTestDate, setNextTestDate] = useState<Date>();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // BIA fields
  const [biaCriticalityRating, setBiaCriticalityRating] = useState('Medium');
  const [biaFinancialImpact, setBiaFinancialImpact] = useState('');
  const [biaOperationalImpact, setBiaOperationalImpact] = useState('');
  const [biaReputationalImpact, setBiaReputationalImpact] = useState('');
  const [biaRegulatoryImpact, setBiaRegulatoryImpact] = useState('');
  const [biaMaxTolerableDowntime, setBiaMaxTolerableDowntime] = useState('');
  const [biaAssessmentDate, setBiaAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Enhanced test fields
  const [testType, setTestType] = useState('');
  const [testScope, setTestScope] = useState('');
  const [testResults, setTestResults] = useState('');
  const [testFindings, setTestFindings] = useState<{ description: string; severity: string; recommendation: string }[]>([]);

  useEffect(() => {
    if (open) {
      fetchOwners();
    }
  }, [open]);

  const fetchOwners = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .not('full_name', 'is', null);
      
      if (error) {
        console.error('Owners fetch error:', error);
        setOwners([]); // Set empty array on error
        return;
      }
      
      setOwners(data || []);
    } catch (error) {
      console.error('Error fetching owners:', error);
      setOwners([]); // Set empty array on error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const effectiveAssessmentDate = biaAssessmentDate || new Date().toISOString().split('T')[0];

    const parsed = bcpAddSchema.safeParse({
      title,
      businessFunction,
      description,
      biaCriticalityRating,
      biaFinancialImpact,
      biaOperationalImpact,
      biaReputationalImpact,
      biaRegulatoryImpact,
      biaMaxTolerableDowntime,
      biaAssessmentDate: effectiveAssessmentDate,
      testType,
      testScope,
      testResults,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0] as string;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      toast({
        title: 'Please fix the highlighted fields',
        description: `${parsed.error.errors.length} validation error(s) found.`,
        variant: 'destructive',
      });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      // Upload documents first
      const documentUrls: any[] = [];
      for (const file of uploadedFiles) {
        const fileName = `${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('bcp-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        documentUrls.push({
          name: file.name,
          url: uploadData.path,
          uploaded_at: new Date().toISOString()
        });
      }

      // Create BCP record
      const { error } = await supabase
        .from('business_continuity_plans')
        .insert({
          title,
          description,
          department,
          owner_id: ownerId || null,
          business_function: businessFunction,
          dependencies: dependencies.filter(d => d.trim()),
          mitigation_actions: JSON.parse(JSON.stringify(mitigationActions)),
          recovery_time_objective: recoveryTimeObjective ? parseInt(recoveryTimeObjective) : null,
          recovery_point_objective: recoveryPointObjective ? parseInt(recoveryPointObjective) : null,
          status,
          test_status: testStatus,
          last_tested_date: lastTestedDate?.toISOString().split('T')[0] || null,
          next_test_date: nextTestDate?.toISOString().split('T')[0] || null,
          supporting_documents: JSON.parse(JSON.stringify(documentUrls)),
          created_by: user.id,
          bia_criticality_rating: biaCriticalityRating,
          bia_financial_impact: biaFinancialImpact ? parseFloat(biaFinancialImpact) : null,
          bia_operational_impact: biaOperationalImpact || null,
          bia_reputational_impact: biaReputationalImpact || null,
          bia_regulatory_impact: biaRegulatoryImpact || null,
          bia_max_tolerable_downtime: biaMaxTolerableDowntime ? parseInt(biaMaxTolerableDowntime) : null,
          bia_assessment_date: effectiveAssessmentDate,
          test_type: testType || null,
          test_scope: testScope || null,
          test_results: testResults || null,
          test_findings: JSON.parse(JSON.stringify(testFindings)),
        } as any);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Business continuity plan created successfully'
      });

      // Reset form
      setTitle('');
      setDescription('');
      setDepartment('');
      setOwnerId('');
      setBusinessFunction('');
      setDependencies(['']);
      setMitigationActions([]);
      setRecoveryTimeObjective('');
      setRecoveryPointObjective('');
      setStatus('Needs Review');
      setTestStatus('Not Tested');
      setLastTestedDate(undefined);
      setNextTestDate(undefined);
      setUploadedFiles([]);
      setBiaCriticalityRating('Medium');
      setBiaFinancialImpact('');
      setBiaOperationalImpact('');
      setBiaReputationalImpact('');
      setBiaRegulatoryImpact('');
      setBiaMaxTolerableDowntime('');
      setTestType('');
      setTestScope('');
      setTestResults('');
      setTestFindings([]);

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating BCP:', error);
      const mapped = mapBcpServerError(error);
      if (Object.keys(mapped.fieldErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...mapped.fieldErrors }));
        toast({
          title: 'Server validation failed',
          description: 'Please fix the highlighted fields and try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: mapped.generalMessage || 'Failed to create business continuity plan',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const addDependency = () => {
    setDependencies([...dependencies, '']);
  };

  const updateDependency = (index: number, value: string) => {
    const updated = [...dependencies];
    updated[index] = value;
    setDependencies(updated);
  };

  const removeDependency = (index: number) => {
    setDependencies(dependencies.filter((_, i) => i !== index));
  };

  const addMitigationAction = () => {
    setMitigationActions([...mitigationActions, {
      action: '',
      responsible: '',
      target_date: null,
      status: 'Pending'
    }]);
  };

  const updateMitigationAction = (index: number, field: keyof MitigationAction, value: any) => {
    const updated = [...mitigationActions];
    updated[index] = { ...updated[index], [field]: value };
    setMitigationActions(updated);
  };

  const removeMitigationAction = (index: number) => {
    setMitigationActions(mitigationActions.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadedFiles([...uploadedFiles, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Business Continuity Plan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Plan Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department *</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="businessFunction">Business Function *</Label>
              <Input
                id="businessFunction"
                value={businessFunction}
                onChange={(e) => setBusinessFunction(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Plan Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((owner) => (
                    <SelectItem key={owner.user_id} value={owner.user_id}>
                      {owner.full_name} ({owner.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Dependencies</Label>
              <Button type="button" variant="outline" size="sm" onClick={addDependency}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            {dependencies.map((dep, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={dep}
                  onChange={(e) => updateDependency(index, e.target.value)}
                  placeholder="Enter dependency"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeDependency(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Recovery Objectives */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rto">Recovery Time Objective (hours)</Label>
              <Input
                id="rto"
                type="number"
                value={recoveryTimeObjective}
                onChange={(e) => setRecoveryTimeObjective(e.target.value)}
                placeholder="e.g., 24"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rpo">Recovery Point Objective (hours)</Label>
              <Input
                id="rpo"
                type="number"
                value={recoveryPointObjective}
                onChange={(e) => setRecoveryPointObjective(e.target.value)}
                placeholder="e.g., 4"
              />
            </div>
          </div>

          {/* Status and Test Information */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Needs Review">Needs Review</SelectItem>
                  <SelectItem value="Outdated">Outdated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Test Status</Label>
              <Select value={testStatus} onValueChange={(value: any) => setTestStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Tested">Not Tested</SelectItem>
                  <SelectItem value="Passed">Passed</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Test Dates */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Last Tested Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !lastTestedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {lastTestedDate ? format(lastTestedDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={lastTestedDate}
                    onSelect={setLastTestedDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Next Test Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !nextTestDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {nextTestDate ? format(nextTestDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={nextTestDate}
                    onSelect={setNextTestDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Business Impact Assessment */}
          <BIASection
            criticalityRating={biaCriticalityRating}
            setCriticalityRating={setBiaCriticalityRating}
            financialImpact={biaFinancialImpact}
            setFinancialImpact={setBiaFinancialImpact}
            operationalImpact={biaOperationalImpact}
            setOperationalImpact={setBiaOperationalImpact}
            reputationalImpact={biaReputationalImpact}
            setReputationalImpact={setBiaReputationalImpact}
            regulatoryImpact={biaRegulatoryImpact}
            setRegulatoryImpact={setBiaRegulatoryImpact}
            maxTolerableDowntime={biaMaxTolerableDowntime}
            setMaxTolerableDowntime={setBiaMaxTolerableDowntime}
            assessmentDate={biaAssessmentDate}
            setAssessmentDate={setBiaAssessmentDate}
            errors={fieldErrors}
          />

          {/* Test Details */}
          <TestDetailsSection
            testType={testType}
            setTestType={setTestType}
            testScope={testScope}
            setTestScope={setTestScope}
            testResults={testResults}
            setTestResults={setTestResults}
            testFindings={testFindings}
            setTestFindings={setTestFindings}
            errors={fieldErrors}
          />

          {/* Mitigation Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Mitigation Actions</Label>
              <Button type="button" variant="outline" size="sm" onClick={addMitigationAction}>
                <Plus className="w-4 h-4 mr-1" />
                Add Action
              </Button>
            </div>
            {mitigationActions.map((action, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-medium">Action {index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMitigationAction(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Action Description</Label>
                    <Input
                      value={action.action}
                      onChange={(e) => updateMitigationAction(index, 'action', e.target.value)}
                      placeholder="Describe the action"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Responsible Person</Label>
                    <Input
                      value={action.responsible}
                      onChange={(e) => updateMitigationAction(index, 'responsible', e.target.value)}
                      placeholder="Who is responsible"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Supporting Documents</Label>
            <div className="border-2 border-dashed rounded-lg p-4">
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                accept=".pdf,.doc,.docx,.txt,.jpg,.png"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Click to upload supporting documents
                </span>
              </label>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}