import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarIcon, AlertTriangle, Zap, ExternalLink, Download } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { IncidentTimeline } from './IncidentTimeline';
import { exportIncidentDetailPDF } from './ExportIncidentsMenu';

interface AddIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  incident?: any | null; // when provided, dialog operates in edit mode
  defaultTab?: 'details' | 'response' | 'impact' | 'posture' | 'history';
  /** When opening on the history tab, scroll to and highlight this audit-log entry id. */
  highlightEntryId?: string;
}

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
const POSTURES = ['Elevated', 'Stable', 'Reduced', 'Under Review'] as const;
const STATUSES = ['Open', 'Under Investigation', 'Resolved', 'Closed'] as const;

export function AddIncidentDialog({ open, onOpenChange, onSuccess, incident, defaultTab, highlightEntryId }: AddIncidentDialogProps) {
  const isEditMode = Boolean(incident?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('details');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [risks, setRisks] = useState<{ id: string; title: string; risk_reference: string | null }[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const OWNER_ROLES = ['RMD', 'CRO', 'ADMIN', 'ERMSC', 'EC'];
  const canAssignOwner = !!user?.role && OWNER_ROLES.includes(user.role as string);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string | null; event_date: string | null; reference_number: string | null }>>([]);

  const [form, setForm] = useState({
    title: '',
    risk_id: 'none',
    event_date: undefined as Date | undefined,
    discovered_date: new Date(),
    severity: 'Medium' as string,
    event_description: '',
    root_cause: '',
    immediate_response: '',
    financial_impact: '',
    financial_impact_currency: 'NGN',
    operational_impact: '',
    reputational_impact: '',
    risk_posture: 'Under Review' as string,
    lessons_learned: '',
    status: 'Open' as string,
    owner_id: '' as string,
  });

  useEffect(() => {
    if (!open) return;
    supabase
      .from('risks')
      .select('id, title, risk_reference')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setRisks(data || []));
    if (canAssignOwner) {
      supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(500)
        .then(({ data }) => setAssignableUsers(data || []));
    }
  }, [open, canAssignOwner]);

  // Hydrate form when editing an existing incident
  useEffect(() => {
    if (!open) return;
    if (incident?.id) {
      setForm({
        title: incident.title || '',
        risk_id: incident.risk_id || 'none',
        event_date: incident.event_date ? new Date(incident.event_date) : (incident.occurred_at ? new Date(incident.occurred_at) : undefined),
        discovered_date: incident.discovered_date ? new Date(incident.discovered_date) : new Date(),
        severity: incident.severity || 'Medium',
        event_description: incident.event_description || incident.description || '',
        root_cause: incident.root_cause || '',
        immediate_response: incident.immediate_response || '',
        financial_impact: incident.financial_impact != null ? String(incident.financial_impact) : (incident.impact_amount != null ? String(incident.impact_amount) : ''),
        financial_impact_currency: incident.financial_impact_currency || 'NGN',
        operational_impact: incident.operational_impact || '',
        reputational_impact: incident.reputational_impact || '',
        risk_posture: incident.risk_posture || 'Under Review',
        lessons_learned: incident.lessons_learned || '',
        status: incident.status || 'Open',
        owner_id: incident.owner_id || incident.reported_by || '',
      });
      setActiveTab(defaultTab && (defaultTab !== 'history' || incident?.id) ? defaultTab : 'details');
      setErrors({});
      setDuplicates([]);
    } else if (!incident && open) {
      // reset for fresh add when opened without incident
      setForm({
        title: '', risk_id: 'none',
        event_date: undefined, discovered_date: new Date(),
        severity: 'Medium', event_description: '', root_cause: '', immediate_response: '',
        financial_impact: '', financial_impact_currency: 'NGN',
        operational_impact: '', reputational_impact: '',
        risk_posture: 'Under Review', lessons_learned: '', status: 'Open', owner_id: user?.id || '',
      });
      setErrors({});
      setDuplicates([]);
      setActiveTab('details');
    }
  }, [open, incident]);

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    // Any field change invalidates the previous duplicate result
    if (duplicates.length > 0 && (field === 'title' || field === 'event_date')) {
      setDuplicates([]);
    }
  };

  const handleSubmit = async (force: boolean = false) => {
    const v: Record<string, string> = {};
    const title = form.title.trim();

    // Required-field validation
    if (!title) v.title = 'Title is required';
    else if (title.length < 5) v.title = 'Title must be at least 5 characters';
    else if (title.length > 200) v.title = 'Title must be 200 characters or less';

    if (!form.event_date) v.event_date = 'Event date is required';
    else if (form.event_date > new Date()) v.event_date = 'Event date cannot be in the future';

    if (form.discovered_date && form.event_date && form.discovered_date < form.event_date) {
      v.discovered_date = 'Discovery date cannot be before the event date';
    }

    if (!form.event_description.trim()) v.event_description = 'Description is required';
    else if (form.event_description.trim().length < 10) v.event_description = 'Description must be at least 10 characters';

    if (!form.severity) v.severity = 'Severity is required';
    if (!form.status) v.status = 'Status is required';
    if (!form.risk_posture) v.risk_posture = 'Risk posture is required';

    if (form.financial_impact && (isNaN(Number(form.financial_impact)) || Number(form.financial_impact) < 0)) {
      v.financial_impact = 'Financial impact must be a positive number';
    }

    if (Object.keys(v).length > 0) {
      setErrors(v);
      if (v.title || v.event_date || v.discovered_date || v.event_description || v.severity || v.status) setActiveTab('details');
      else if (v.financial_impact) setActiveTab('impact');
      else if (v.risk_posture) setActiveTab('posture');
      toast({ title: 'Validation Error', description: 'Please fix the highlighted fields before submitting.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Duplicate check: fuzzy title match (normalized) within ±3 days of the event date.
      // Skipped when the user has chosen to "Submit Anyway" after seeing the inline list.
      const eventDateStr = format(form.event_date!, 'yyyy-MM-dd');

      if (!force && !isEditMode) {
        const windowStart = new Date(form.event_date!); windowStart.setDate(windowStart.getDate() - 3);
        const windowEnd = new Date(form.event_date!); windowEnd.setDate(windowEnd.getDate() + 3);
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const normalized = normalize(title);
        const tokens = normalized.split(' ').filter((w) => w.length > 3).slice(0, 4);

        let q = supabase
          .from('risk_events')
          .select('id, title, event_date, reference_number')
          .gte('event_date', format(windowStart, 'yyyy-MM-dd'))
          .lte('event_date', format(windowEnd, 'yyyy-MM-dd'))
          .limit(50);

        if (tokens.length > 0) {
          q = q.or([`title.ilike.%${title}%`, ...tokens.map((t) => `title.ilike.%${t}%`)].join(','));
        } else {
          q = q.ilike('title', `%${title}%`);
        }

        const { data: candidates, error: dupErr } = await q;
        if (dupErr) throw dupErr;

        const matches = (candidates || []).filter((c: any) => {
          const cn = normalize(c.title || '');
          if (!cn) return false;
          if (cn === normalized) return true;
          const aSet = new Set(normalized.split(' ').filter((w) => w.length > 2));
          const bSet = new Set(cn.split(' ').filter((w) => w.length > 2));
          if (!aSet.size || !bSet.size) return false;
          const inter = [...aSet].filter((w) => bSet.has(w)).length;
          const union = new Set([...aSet, ...bSet]).size;
          return inter / union >= 0.6 || cn.includes(normalized) || normalized.includes(cn);
        }).slice(0, 5);

        if (matches.length > 0) {
          setDuplicates(matches as any);
          setSubmitting(false);
          setActiveTab('details');
          toast({
            title: 'Possible duplicate detected',
            description: 'Review the matching incidents below, or press "Submit Anyway".',
            variant: 'destructive',
          });
          return;
        }
      }

      // Auto-set resolution_date when status moves to Resolved/Closed
      const isResolvedStatus = form.status === 'Resolved' || form.status === 'Closed';
      const previousResolution = incident?.resolution_date || null;
      const resolvedAtIso = incident?.resolved_at || null;

      const payload: any = {
        title,
        risk_id: form.risk_id !== 'none' ? form.risk_id : null,
        event_date: eventDateStr,
        discovered_date: format(form.discovered_date, 'yyyy-MM-dd'),
        occurred_at: form.event_date!.toISOString(),
        severity: form.severity,
        description: form.event_description.trim(),
        event_description: form.event_description.trim(),
        root_cause: form.root_cause.trim() || null,
        immediate_response: form.immediate_response.trim() || null,
        financial_impact: form.financial_impact ? Number(form.financial_impact) : null,
        impact_amount: form.financial_impact ? Number(form.financial_impact) : null,
        financial_impact_currency: form.financial_impact_currency,
        operational_impact: form.operational_impact.trim() || null,
        reputational_impact: form.reputational_impact.trim() || null,
        risk_posture: form.risk_posture,
        lessons_learned: form.lessons_learned.trim() || null,
        status: form.status,
        event_type: 'incident',
        resolution_date: isResolvedStatus ? (previousResolution || format(new Date(), 'yyyy-MM-dd')) : null,
        resolved_at: isResolvedStatus ? (resolvedAtIso || new Date().toISOString()) : null,
      };

      // Only allow owner change on edit if the user has permission
      if (isEditMode) {
        if (canAssignOwner && form.owner_id) {
          payload.owner_id = form.owner_id;
        }
      } else {
        payload.owner_id = canAssignOwner && form.owner_id ? form.owner_id : user!.id;
      }

      let dbError: any = null;
      if (isEditMode) {
        const { error } = await supabase.from('risk_events').update(payload).eq('id', incident.id);
        dbError = error;
      } else {
        payload.reported_by = user!.id;
        const { error } = await supabase.from('risk_events').insert(payload);
        dbError = error;
      }
      if (dbError) throw dbError;

      toast({
        title: isEditMode ? 'Incident Updated' : 'Incident Logged',
        description: `"${title}" has been ${isEditMode ? 'updated' : 'recorded'}.`,
      });
      onSuccess?.();
      onOpenChange(false);
      // reset
      setForm({
        title: '', risk_id: 'none',
        event_date: undefined, discovered_date: new Date(),
        severity: 'Medium', event_description: '', root_cause: '', immediate_response: '',
        financial_impact: '', financial_impact_currency: 'NGN',
        operational_impact: '', reputational_impact: '',
        risk_posture: 'Under Review', lessons_learned: '', status: 'Open', owner_id: user?.id || '',
      });
      setActiveTab('details');
      setDuplicates([]);
    } catch (err: any) {
      console.error('Error logging incident:', err);
      toast({ title: 'Error', description: err.message || 'Failed to log incident.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = isEditMode ? ['details', 'response', 'impact', 'posture', 'history'] : ['details', 'response', 'impact', 'posture'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-destructive" />
            {isEditMode ? 'Edit Incident' : 'Add Incident'}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              {isEditMode
                ? `Update the details of incident ${incident?.reference_number || ''}. Changes are tracked in the History tab.`
                : 'Log a new incident or risk event. Optionally link it to an existing risk in the register.'}
            </span>
            {isEditMode && incident && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => exportIncidentDetailPDF(incident)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
              </Button>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className={cn('grid w-full', isEditMode ? 'grid-cols-5' : 'grid-cols-4')}>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="impact">Impact</TabsTrigger>
            <TabsTrigger value="posture">Posture</TabsTrigger>
            {isEditMode && <TabsTrigger value="history">History</TabsTrigger>}
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {duplicates.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Possible duplicate incident{duplicates.length > 1 ? 's' : ''} found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      An incident with a similar title was logged within ±3 days of {format(form.event_date!, 'PPP')}. Open it to review, or submit anyway if it is a separate event.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1 pl-6">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm bg-background rounded border px-2 py-1.5">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{d.title || 'Untitled incident'}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.reference_number && <span className="font-mono mr-2">{d.reference_number}</span>}
                          {d.event_date && <span>Event: {format(new Date(d.event_date), 'PP')}</span>}
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 shrink-0">
                        <Link to={`/incidents?focus=${d.id}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label>Incident Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Short summary of the incident"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                className={cn(errors.title && 'border-destructive')}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label>Linked Risk (optional)</Label>
              <Select value={form.risk_id} onValueChange={(v) => updateField('risk_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select a risk to link" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {risks.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.risk_reference ? `[${r.risk_reference}] ` : ''}{r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Incident Owner{canAssignOwner && <span className="text-destructive"> *</span>}</Label>
              {canAssignOwner ? (
                <>
                  <Select
                    value={form.owner_id || (user?.id ?? '')}
                    onValueChange={(v) => updateField('owner_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign an owner" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.full_name || u.email || u.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {isEditMode
                      ? 'Reassign this incident to another user. Every change is recorded in the activity timeline.'
                      : 'Assign the incident owner. Defaults to you if left unchanged.'}
                  </p>
                </>
              ) : (
                <>
                  <Input
                    readOnly
                    disabled
                    value={
                      isEditMode
                        ? (incident?.owner?.full_name || incident?.owner?.email
                            || incident?.reporter?.full_name || incident?.reporter?.email
                            || '— Unknown —')
                        : (user?.email || '')
                    }
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEditMode
                      ? 'Only RMD, CRO, ADMIN, ERMSC or EC can reassign the incident owner.'
                      : 'You will be recorded as the owner of this incident.'}
                  </p>
                </>
              )}
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Date <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !form.event_date && 'text-muted-foreground', errors.event_date && 'border-destructive')}>
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
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', errors.discovered_date && 'border-destructive')}>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity <span className="text-destructive">*</span></Label>
                <Select value={form.severity} onValueChange={(v) => updateField('severity', v)}>
                  <SelectTrigger className={cn(errors.severity && 'border-destructive')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.severity && <p className="text-xs text-destructive">{errors.severity}</p>}
              </div>
              <div className="space-y-2">
                <Label>Status <span className="text-destructive">*</span></Label>
                <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger className={cn(errors.status && 'border-destructive')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.status && <p className="text-xs text-destructive">{errors.status}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Incident Description <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Describe what happened in detail..."
                value={form.event_description}
                onChange={(e) => updateField('event_description', e.target.value)}
                className={cn('min-h-[120px]', errors.event_description && 'border-destructive')}
                maxLength={5000}
              />
              {errors.event_description && <p className="text-xs text-destructive">{errors.event_description}</p>}
            </div>
          </TabsContent>

          <TabsContent value="response" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Root Cause Analysis</Label>
              <Textarea
                placeholder="What was the underlying cause?"
                value={form.root_cause}
                onChange={(e) => updateField('root_cause', e.target.value)}
                className="min-h-[100px]"
                maxLength={5000}
              />
            </div>
            <div className="space-y-2">
              <Label>Immediate Response / Actions Taken</Label>
              <Textarea
                placeholder="What was done immediately to address the incident?"
                value={form.immediate_response}
                onChange={(e) => updateField('immediate_response', e.target.value)}
                className="min-h-[100px]"
                maxLength={5000}
              />
            </div>
          </TabsContent>

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
              <Textarea placeholder="Describe operational disruption..." value={form.operational_impact} onChange={(e) => updateField('operational_impact', e.target.value)} maxLength={3000} />
            </div>
            <div className="space-y-2">
              <Label>Reputational Impact</Label>
              <Textarea placeholder="Describe reputational consequences..." value={form.reputational_impact} onChange={(e) => updateField('reputational_impact', e.target.value)} maxLength={3000} />
            </div>
          </TabsContent>

          <TabsContent value="posture" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Post-Event Risk Posture</Label>
              <Select value={form.risk_posture} onValueChange={(v) => updateField('risk_posture', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSTURES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lessons Learned</Label>
              <Textarea placeholder="Key takeaways..." value={form.lessons_learned} onChange={(e) => updateField('lessons_learned', e.target.value)} className="min-h-[120px]" maxLength={5000} />
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
              <p className="text-muted-foreground">
                Submitting will create a new incident record. If linked to a risk, it will appear on that risk's timeline.
              </p>
            </div>
          </TabsContent>

          {isEditMode && (
            <TabsContent value="history" className="mt-4">
              <div className="mb-2 text-sm text-muted-foreground">
                Activity log for this incident. Each entry shows who made a change, when, and which fields were updated.
              </div>
              <IncidentTimeline incidentId={incident!.id} highlightEntryId={highlightEntryId} />
            </TabsContent>
          )}
        </Tabs>

        <div className="flex justify-between mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {activeTab === 'history' ? 'Close' : 'Cancel'}
          </Button>
          <div className="flex gap-2">
            {activeTab !== 'details' && activeTab !== 'history' && (
              <Button variant="outline" onClick={() => {
                const idx = tabs.indexOf(activeTab);
                if (idx > 0) setActiveTab(tabs[idx - 1]);
              }}>Previous</Button>
            )}
            {activeTab === 'history' ? null : activeTab !== 'posture' ? (
              <Button onClick={() => {
                const idx = tabs.indexOf(activeTab);
                if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
              }}>Next</Button>
            ) : duplicates.length > 0 ? (
              <Button variant="destructive" onClick={() => handleSubmit(true)} disabled={submitting}>
                {submitting ? 'Saving…' : 'Submit Anyway'}
              </Button>
            ) : (
              <Button onClick={() => handleSubmit(false)} disabled={submitting}>
                {submitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Log Incident'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
