import React, { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Zap, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const crystallizedSchema = z.object({
  event_date: z.date({ required_error: 'Event date is required' }),
  discovered_date: z.date(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  event_description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  root_cause: z.string().min(10, 'Root cause must be at least 10 characters').max(5000),
  immediate_response: z.string().min(10, 'Response must be at least 10 characters').max(5000),
  financial_impact: z.number().min(0).nullable(),
  financial_impact_currency: z.string().default('NGN'),
  operational_impact: z.string().max(3000).optional(),
  reputational_impact: z.string().max(3000).optional(),
  risk_posture: z.enum(['Elevated', 'Stable', 'Reduced', 'Under Review']),
  lessons_learned: z.string().max(5000).optional(),
});

interface CorrectiveAction {
  action: string;
  owner_id: string;
  deadline: string;
  status: string;
}

interface ReportCrystallizedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: any;
  onSuccess?: () => void;
}

export function ReportCrystallizedDialog({ open, onOpenChange, risk, onSuccess }: ReportCrystallizedDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<any | null>(null);

  const [form, setForm] = useState({
    event_date: undefined as Date | undefined,
    discovered_date: new Date(),
    severity: 'Medium' as string,
    event_description: '',
    root_cause: '',
    immediate_response: '',
    financial_impact: '' as string,
    financial_impact_currency: 'NGN',
    operational_impact: '',
    reputational_impact: '',
    risk_posture: 'Under Review' as string,
    lessons_learned: '',
  });

  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [newAction, setNewAction] = useState({ action: '', owner_id: '', deadline: '' });

  const addCorrectiveAction = () => {
    if (!newAction.action.trim()) return;
    setCorrectiveActions(prev => [...prev, { ...newAction, status: 'pending' }]);
    setNewAction({ action: '', owner_id: '', deadline: '' });
  };

  const removeCorrectiveAction = (index: number) => {
    setCorrectiveActions(prev => prev.filter((_, i) => i !== index));
  };

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const resetForm = () => {
    setForm({
      event_date: undefined,
      discovered_date: new Date(),
      severity: 'Medium',
      event_description: '',
      root_cause: '',
      immediate_response: '',
      financial_impact: '',
      financial_impact_currency: 'NGN',
      operational_impact: '',
      reputational_impact: '',
      risk_posture: 'Under Review',
      lessons_learned: '',
    });
    setCorrectiveActions([]);
    setErrors({});
    setServerError(null);
    setCreatedEvent(null);
    setActiveTab('details');
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // closing
      resetForm();
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    setServerError(null);

    // Client-side validation — block on missing critical fields
    const validationErrors: Record<string, string> = {};
    if (!form.event_date) {
      validationErrors.event_date = 'Event date is required to report a crystallized risk';
    } else if (form.event_date > new Date()) {
      validationErrors.event_date = 'Event date cannot be in the future';
    }
    if (form.discovered_date && form.event_date && form.discovered_date < form.event_date) {
      validationErrors.discovered_date = 'Discovery date cannot be before the event date';
    }
    const desc = form.event_description.trim();
    if (!desc) {
      validationErrors.event_description = 'Event description is required';
    } else if (desc.length < 10) {
      validationErrors.event_description = 'Description must be at least 10 characters';
    }
    if (!form.root_cause.trim() || form.root_cause.trim().length < 10) {
      validationErrors.root_cause = 'Root cause must be at least 10 characters';
    }
    if (!form.immediate_response.trim() || form.immediate_response.trim().length < 10) {
      validationErrors.immediate_response = 'Immediate response must be at least 10 characters';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      if (validationErrors.event_date || validationErrors.event_description || validationErrors.discovered_date) setActiveTab('details');
      else if (validationErrors.root_cause || validationErrors.immediate_response) setActiveTab('response');
      toast({ title: 'Validation Error', description: 'Please fix the highlighted fields before submitting.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Consistent payload — populate ALL required fields (description, event_type, occurred_at)
      const payload = {
        risk_id: risk.id,
        event_type: 'crystallized',
        occurred_at: form.event_date!.toISOString(),
        description: desc, // required NOT NULL column
        event_date: format(form.event_date!, 'yyyy-MM-dd'),
        discovered_date: format(form.discovered_date, 'yyyy-MM-dd'),
        reported_by: user!.id,
        severity: form.severity,
        event_description: desc,
        root_cause: form.root_cause.trim(),
        immediate_response: form.immediate_response.trim(),
        corrective_actions: correctiveActions as any,
        financial_impact: form.financial_impact ? Number(form.financial_impact) : null,
        financial_impact_currency: form.financial_impact_currency,
        operational_impact: form.operational_impact?.trim() || null,
        reputational_impact: form.reputational_impact?.trim() || null,
        risk_posture: form.risk_posture,
        lessons_learned: form.lessons_learned?.trim() || null,
        status: 'Open',
      };

      const { data: insertedEvent, error: eventError } = await supabase
        .from('risk_events')
        .insert(payload as any)
        .select('id, reference_number, event_date, severity, status')
        .single();

      if (eventError) throw eventError;

      const { error: riskError } = await supabase
        .from('risks')
        .update({ status: 'Crystallized' as any })
        .eq('id', risk.id);

      if (riskError) throw riskError;

      toast({ title: 'Risk Event Reported', description: `"${risk.title}" has been marked as Crystallized.` });
      setCreatedEvent(insertedEvent);
      onSuccess?.();
      // keep dialog open to show confirmation screen
    } catch (error: any) {
      console.error('Error reporting crystallized risk:', error);
      const msg: string = error?.message || 'Failed to report risk event.';
      // Map Postgres errors back to specific fields
      const fieldErrors: Record<string, string> = {};
      const colMatch = msg.match(/column "([^"]+)"/i);
      if (/null value in column/i.test(msg) && colMatch) {
        const col = colMatch[1];
        const fieldMap: Record<string, { tab: string; key: string; label: string }> = {
          description: { tab: 'details', key: 'event_description', label: 'Event description is required' },
          event_description: { tab: 'details', key: 'event_description', label: 'Event description is required' },
          event_date: { tab: 'details', key: 'event_date', label: 'Event date is required' },
          occurred_at: { tab: 'details', key: 'event_date', label: 'Event date is required' },
          root_cause: { tab: 'response', key: 'root_cause', label: 'Root cause is required' },
          immediate_response: { tab: 'response', key: 'immediate_response', label: 'Immediate response is required' },
        };
        const mapped = fieldMap[col];
        if (mapped) {
          fieldErrors[mapped.key] = mapped.label;
          setActiveTab(mapped.tab);
        }
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...fieldErrors }));
      }
      setServerError(msg);
      toast({ title: 'Submission failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const severityColors: Record<string, string> = {
    Low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    Critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  // Success / confirmation screen
  if (createdEvent) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Crystallized Risk Reported
            </DialogTitle>
            <DialogDescription>
              The event has been recorded and the risk status updated.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Risk</span>
              <span className="font-medium text-right">{risk.title}</span>
            </div>
            {createdEvent.reference_number && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Event reference</span>
                <span className="font-mono font-medium">{createdEvent.reference_number}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Event date</span>
              <span className="font-medium">{createdEvent.event_date}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Severity</span>
              <Badge variant="outline" className={severityColors[createdEvent.severity] || ''}>{createdEvent.severity}</Badge>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{createdEvent.status}</Badge>
            </div>
          </div>

          <div className="flex justify-between gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            <Button onClick={() => { handleClose(false); navigate('/risk-register'); }}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Back to Risk Register
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-destructive" />
            Report Crystallized Risk
          </DialogTitle>
          <DialogDescription>
            Record that <span className="font-medium">"{risk.title}"</span> has materialized. Capture the event details, root cause, response, and impact.
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not save the report</AlertTitle>
            <AlertDescription className="text-xs break-words">{serverError}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Event Details</TabsTrigger>
            <TabsTrigger value="response">Root Cause</TabsTrigger>
            <TabsTrigger value="impact">Impact</TabsTrigger>
            <TabsTrigger value="posture">Posture</TabsTrigger>
          </TabsList>

          {/* Tab 1: Event Details */}
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Date <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.event_date && "text-muted-foreground", errors.event_date && "border-destructive")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.event_date ? format(form.event_date, 'PPP') : 'When did it happen?'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.event_date} onSelect={(d) => updateField('event_date', d)} disabled={(date) => date > new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {errors.event_date && <p className="text-xs text-destructive">{errors.event_date}</p>}
              </div>
              <div className="space-y-2">
                <Label>Discovery Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(form.discovered_date, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.discovered_date} onSelect={(d) => d && updateField('discovered_date', d)} disabled={(date) => date > new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {errors.discovered_date && <p className="text-xs text-destructive">{errors.discovered_date}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Severity</Label>
              <div className="flex gap-2">
                {['Low', 'Medium', 'High', 'Critical'].map(s => (
                  <button key={s} type="button" onClick={() => updateField('severity', s)}
                    className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all border", form.severity === s ? severityColors[s] + ' border-current ring-1 ring-current/30' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Event Description <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Describe what happened in detail..." value={form.event_description} onChange={(e) => updateField('event_description', e.target.value)}
                className={cn("min-h-[120px]", errors.event_description && "border-destructive")} maxLength={5000} />
              {errors.event_description && <p className="text-xs text-destructive">{errors.event_description}</p>}
              <p className="text-xs text-muted-foreground text-right">{form.event_description.length}/5000</p>
            </div>
          </TabsContent>

          {/* Tab 2: Root Cause & Response */}
          <TabsContent value="response" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Root Cause Analysis <span className="text-destructive">*</span></Label>
              <Textarea placeholder="What was the underlying cause?" value={form.root_cause} onChange={(e) => updateField('root_cause', e.target.value)}
                className={cn("min-h-[100px]", errors.root_cause && "border-destructive")} maxLength={5000} />
              {errors.root_cause && <p className="text-xs text-destructive">{errors.root_cause}</p>}
            </div>

            <div className="space-y-2">
              <Label>Immediate Response / Actions Taken <span className="text-destructive">*</span></Label>
              <Textarea placeholder="What was done immediately to address the event?" value={form.immediate_response} onChange={(e) => updateField('immediate_response', e.target.value)}
                className={cn("min-h-[100px]", errors.immediate_response && "border-destructive")} maxLength={5000} />
              {errors.immediate_response && <p className="text-xs text-destructive">{errors.immediate_response}</p>}
            </div>

            <div className="space-y-2">
              <Label>Corrective Actions</Label>
              <div className="space-y-2">
                {correctiveActions.map((ca, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm">
                    <span className="flex-1">{ca.action}</span>
                    {ca.deadline && <Badge variant="outline" className="text-xs">{ca.deadline}</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => removeCorrectiveAction(i)} className="h-6 w-6 p-0">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input placeholder="Action description" value={newAction.action} onChange={(e) => setNewAction(p => ({ ...p, action: e.target.value }))} className="flex-1" />
                  <Input type="date" value={newAction.deadline} onChange={(e) => setNewAction(p => ({ ...p, deadline: e.target.value }))} className="w-36" />
                  <Button type="button" variant="outline" size="sm" onClick={addCorrectiveAction} disabled={!newAction.action.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab 3: Impact Assessment */}
          <TabsContent value="impact" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Financial Impact</Label>
                <Input type="number" placeholder="0" value={form.financial_impact} onChange={(e) => updateField('financial_impact', e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.financial_impact_currency} onValueChange={(v) => updateField('financial_impact_currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Operational Impact</Label>
              <Textarea placeholder="Describe the operational disruption caused..." value={form.operational_impact} onChange={(e) => updateField('operational_impact', e.target.value)} maxLength={3000} />
            </div>

            <div className="space-y-2">
              <Label>Reputational Impact</Label>
              <Textarea placeholder="Describe any reputational consequences..." value={form.reputational_impact} onChange={(e) => updateField('reputational_impact', e.target.value)} maxLength={3000} />
            </div>
          </TabsContent>

          {/* Tab 4: Risk Posture */}
          <TabsContent value="posture" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Post-Event Risk Posture</Label>
              <Select value={form.risk_posture} onValueChange={(v) => updateField('risk_posture', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Elevated">Elevated — Risk exposure has increased</SelectItem>
                  <SelectItem value="Stable">Stable — Risk exposure unchanged</SelectItem>
                  <SelectItem value="Reduced">Reduced — Controls strengthened post-event</SelectItem>
                  <SelectItem value="Under Review">Under Review — Assessment ongoing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Lessons Learned</Label>
              <Textarea placeholder="Key takeaways from this event..." value={form.lessons_learned} onChange={(e) => updateField('lessons_learned', e.target.value)} className="min-h-[120px]" maxLength={5000} />
            </div>

            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive mb-1">
                <AlertTriangle className="w-4 h-4" />
                Confirm Crystallization
              </div>
              <p className="text-muted-foreground">
                Submitting this report will change the risk status to <strong>"Crystallized"</strong> and notify RMD, CRO, and Admin stakeholders.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <div className="flex gap-2">
            {activeTab !== 'details' && (
              <Button variant="outline" onClick={() => {
                const tabs = ['details', 'response', 'impact', 'posture'];
                const idx = tabs.indexOf(activeTab);
                if (idx > 0) setActiveTab(tabs[idx - 1]);
              }}>Previous</Button>
            )}
            {activeTab !== 'posture' ? (
              <Button onClick={() => {
                const tabs = ['details', 'response', 'impact', 'posture'];
                const idx = tabs.indexOf(activeTab);
                if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
              }}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-destructive hover:bg-destructive/90">
                <Zap className="w-4 h-4 mr-2" />
                {submitting ? 'Submitting...' : 'Report as Crystallized'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
