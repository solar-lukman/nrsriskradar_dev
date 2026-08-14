import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { mapBcpServerError } from '@/lib/bcpServerErrors';
import {
  fetchTests, syncTests, validateTests, latestCompleted, nextScheduled,
  type BCPTestEntry,
} from '@/lib/bcpTests';
import { deriveBcpStatus, canSignOffBcp, canOverrideBcpStatus } from '@/lib/bcpStatus';


export interface MitigationAction {
  action: string;
  responsible: string;
  target_date: string | null;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface TestFinding {
  description: string;
  severity: string;
  recommendation: string;
}

export interface BCPFormState {
  title: string;
  description: string;
  department: string;
  ownerId: string;
  businessFunction: string;
  dependencies: string[];
  mitigationActions: MitigationAction[];
  recoveryTimeObjective: string;
  recoveryPointObjective: string;
  status: 'Ready' | 'Needs Review' | 'Outdated';
  /** Sign-off stamp (RMD/CRO/ADMIN only) — drives the Ready transition. */
  signedOffAt: string | null;
  signedOffBy: string | null;
  /** Manual override of the derived status (ADMIN/CRO only). */
  statusOverride: boolean;
  statusOverrideReason: string;

  testStatus: 'Not Tested' | 'Passed' | 'Failed' | 'Overdue';
  lastTestedDate: string;
  nextTestDate: string;
  biaCriticalityRating: string;
  biaFinancialImpact: string;
  biaOperationalImpact: string;
  biaReputationalImpact: string;
  biaRegulatoryImpact: string;
  biaMaxTolerableDowntime: string;
  biaAssessmentDate: string;
  testType: string;
  testScope: string;
  testResults: string;
  testFindings: TestFinding[];
  /** Full test history for this plan (scheduled + completed exercises). */
  tests: BCPTestEntry[];
}

const today = () => new Date().toISOString().split('T')[0];

export const emptyBCPForm = (): BCPFormState => ({
  title: '',
  description: '',
  department: '',
  ownerId: '',
  businessFunction: '',
  dependencies: [],
  mitigationActions: [],
  recoveryTimeObjective: '',
  recoveryPointObjective: '',
  status: 'Needs Review',
  signedOffAt: null,
  signedOffBy: null,
  statusOverride: false,
  statusOverrideReason: '',

  testStatus: 'Not Tested',
  lastTestedDate: '',
  nextTestDate: '',
  biaCriticalityRating: 'Medium',
  biaFinancialImpact: '',
  biaOperationalImpact: '',
  biaReputationalImpact: '',
  biaRegulatoryImpact: '',
  biaMaxTolerableDowntime: '',
  biaAssessmentDate: today(),
  testType: '',
  testScope: '',
  testResults: '',
  testFindings: [],
  tests: [],
});

export const bcpFormSchema = z.object({
  title: z.string().trim().min(1, 'Plan title is required').max(200),
  department: z.string().trim().min(1, 'Department is required'),
  businessFunction: z.string().trim().min(1, 'Business function is required').max(200),
  description: z.string().max(2000).optional(),
  recoveryTimeObjective: z
    .string()
    .refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0), 'RTO must be a non-negative whole number of hours'),
  recoveryPointObjective: z
    .string()
    .refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0), 'RPO must be a non-negative whole number of hours'),
  biaCriticalityRating: z.enum(['Critical', 'High', 'Medium', 'Low']),
  biaFinancialImpact: z
    .string()
    .refine((v) => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), 'Financial impact must be a non-negative number'),
  biaOperationalImpact: z.string().max(2000).optional(),
  biaReputationalImpact: z.string().max(2000).optional(),
  biaRegulatoryImpact: z.string().max(2000).optional(),
  biaMaxTolerableDowntime: z
    .string()
    .refine(
      (v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 43800),
      'MTD must be a non-negative integer (max 43800 hours)',
    ),
  biaAssessmentDate: z.string().refine((v) => {
    if (v === '') return true;
    if (isNaN(Date.parse(v))) return false;
    return new Date(v) <= new Date(today());
  }, 'Assessment date must be valid and not in the future'),
  testType: z.string().max(100).optional(),
  testScope: z.string().max(1000).optional(),
  testResults: z.string().max(4000).optional(),
});

/** Which wizard step owns which field — used to badge steps with errors. */
export const FIELD_STEP: Record<string, number> = {
  title: 0,
  description: 0,
  department: 0,
  ownerId: 0,
  businessFunction: 0,
  recoveryTimeObjective: 0,
  recoveryPointObjective: 0,
  statusOverrideReason: 0,

  mitigationActions: 1,
  biaCriticalityRating: 2,
  biaFinancialImpact: 2,
  biaOperationalImpact: 2,
  biaReputationalImpact: 2,
  biaRegulatoryImpact: 2,
  biaMaxTolerableDowntime: 2,
  biaAssessmentDate: 2,
  testType: 3,
  testScope: 3,
  testResults: 3,
  testFindings: 3,
  tests: 3,
};

const draftKey = (planId?: string) => `bcp.wizard.draft.${planId || 'new'}`;

export interface BCPDraftInfo {
  savedAt: string;
  form: BCPFormState;
}

export function useBCPForm(planId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<BCPFormState>(emptyBCPForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [owners, setOwners] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(!!planId);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [existingTestIds, setExistingTestIds] = useState<string[]>([]);
  const [pendingDraft, setPendingDraft] = useState<BCPDraftInfo | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);


  const setField = useCallback(<K extends keyof BCPFormState>(key: K, value: BCPFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }, []);

  // Owners lookup
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .not('full_name', 'is', null);
      setOwners((data as any) || []);
    })();
  }, []);

  // Load existing plan (edit mode) or restore draft (create mode)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (planId) {
        setLoading(true);
        const { data, error } = await supabase
          .from('business_continuity_plans')
          .select('*')
          .eq('id', planId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          toast({ title: 'Unable to load plan', description: error?.message, variant: 'destructive' });
        } else {
          const p: any = data;
          setForm({
            title: p.title || '',
            description: p.description || '',
            department: p.department || '',
            ownerId: p.owner_id || '',
            businessFunction: p.business_function || '',
            dependencies: Array.isArray(p.dependencies) ? p.dependencies : [],
            mitigationActions: Array.isArray(p.mitigation_actions) ? p.mitigation_actions : [],
            recoveryTimeObjective: p.recovery_time_objective?.toString() || '',
            recoveryPointObjective: p.recovery_point_objective?.toString() || '',
            status: p.status || 'Needs Review',
            signedOffAt: p.signed_off_at || null,
            signedOffBy: p.signed_off_by || null,
            statusOverride: !!p.status_override,
            statusOverrideReason: p.status_override_reason || '',

            testStatus: p.test_status || 'Not Tested',
            lastTestedDate: p.last_tested_date || '',
            nextTestDate: p.next_test_date || '',
            biaCriticalityRating: p.bia_criticality_rating || 'Medium',
            biaFinancialImpact: p.bia_financial_impact?.toString() || '',
            biaOperationalImpact: p.bia_operational_impact || '',
            biaReputationalImpact: p.bia_reputational_impact || '',
            biaRegulatoryImpact: p.bia_regulatory_impact || '',
            biaMaxTolerableDowntime: p.bia_max_tolerable_downtime?.toString() || '',
            biaAssessmentDate: p.bia_assessment_date || today(),
            testType: p.test_type || '',
            testScope: p.test_scope || '',
            testResults: p.test_results || '',
            testFindings: Array.isArray(p.test_findings) ? p.test_findings : [],
            tests: [],
          });
          try {
            const tests = await fetchTests(planId);
            if (!cancelled) {
              setExistingTestIds(tests.map((t) => t.id!).filter(Boolean));
              setForm((prev) => ({ ...prev, tests }));
            }
          } catch (e: any) {
            console.error('Failed to load BCP test history', e);
          }
        }
        setLoading(false);
      }
      // Offer recovery of any autosaved draft for this wizard (new plan or this plan id)
      try {
        const raw = localStorage.getItem(draftKey(planId));
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (parsed?.form) {
            setPendingDraft({ savedAt: parsed.savedAt, form: { ...emptyBCPForm(), ...parsed.form } });
          }
        }
      } catch {
        /* ignore corrupt draft */
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, toast]);

  // Debounced autosave of the working draft
  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(draftKey(planId), JSON.stringify({ savedAt, form }));
        setDraftSavedAt(savedAt);
      } catch {
        /* storage full / unavailable */
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [form, planId, hydrated]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey(planId));
    } catch {
      /* ignore */
    }
    setDraftSavedAt(null);
    setPendingDraft(null);
  }, [planId]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setForm(pendingDraft.form);
    setPendingDraft(null);
  }, [pendingDraft]);

  const dismissDraft = useCallback(() => setPendingDraft(null), []);

  const discardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);


  const validate = useCallback((): Record<string, string> => {
    const testErrs = validateTests(form.tests);
    if (form.statusOverride && !form.statusOverrideReason.trim()) {
      testErrs.statusOverrideReason = 'A justification is required when overriding the plan status';
    }
    const parsed = bcpFormSchema.safeParse(form);
    if (parsed.success) return testErrs;
    const errs: Record<string, string> = { ...testErrs };

    for (const issue of parsed.error.errors) {
      const key = issue.path[0] as string;
      if (key && !errs[key]) errs[key] = issue.message;
    }
    return errs;
  }, [form]);

  /** Validate only the fields owned by a step; returns true when the step is clean. */
  const validateStep = useCallback(
    (step: number) => {
      const all = validate();
      const stepErrors = Object.fromEntries(
        Object.entries(all).filter(([k]) => FIELD_STEP[k] === step || (step === 3 && k.startsWith('tests.'))),
      );
      setErrors((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (FIELD_STEP[k] === step || (step === 3 && k.startsWith('tests.'))) delete next[k];
        }
        return { ...next, ...stepErrors };
      });
      return Object.keys(stepErrors).length === 0;
    },
    [validate],
  );

  const payload = useMemo(() => {
    const last = latestCompleted(form.tests);
    const next = nextScheduled(form.tests);
    return ({
      title: form.title.trim(),
      description: form.description || null,
      department: form.department,
      owner_id: form.ownerId || null,
      business_function: form.businessFunction.trim(),
      dependencies: form.dependencies.filter((d) => d.trim()),
      mitigation_actions: JSON.parse(JSON.stringify(form.mitigationActions)),
      recovery_time_objective: form.recoveryTimeObjective ? parseInt(form.recoveryTimeObjective) : null,
      recovery_point_objective: form.recoveryPointObjective ? parseInt(form.recoveryPointObjective) : null,
      // Status is derived server-side unless an ADMIN/CRO override is in force.
      status: form.status,
      signed_off_at: form.signedOffAt,
      signed_off_by: form.signedOffAt ? form.signedOffBy : null,
      status_override: form.statusOverride,
      status_override_reason: form.statusOverride ? form.statusOverrideReason.trim() : null,

      test_status: last ? last.test_status : form.testStatus,
      last_tested_date: last?.performed_date || form.lastTestedDate || null,
      next_test_date: next?.scheduled_date || form.nextTestDate || null,
      bia_criticality_rating: form.biaCriticalityRating,
      bia_financial_impact: form.biaFinancialImpact ? parseFloat(form.biaFinancialImpact) : null,
      bia_operational_impact: form.biaOperationalImpact || null,
      bia_reputational_impact: form.biaReputationalImpact || null,
      bia_regulatory_impact: form.biaRegulatoryImpact || null,
      bia_max_tolerable_downtime: form.biaMaxTolerableDowntime ? parseInt(form.biaMaxTolerableDowntime) : null,
      bia_assessment_date: form.biaAssessmentDate || today(),
      test_type: last?.test_type || form.testType || null,
      test_scope: last?.test_scope || form.testScope || null,
      test_results: last?.test_results || form.testResults || null,
      test_findings: JSON.parse(JSON.stringify(last?.findings ?? form.testFindings)),
    });
  }, [form]);

  /** Preview of the rule-driven status (server trigger is the authority). */
  const derivedStatus = useMemo(() => {
    const last = latestCompleted(form.tests);
    const next = nextScheduled(form.tests);
    return deriveBcpStatus({
      biaCriticalityRating: form.biaCriticalityRating,
      biaFinancialImpact: form.biaFinancialImpact,
      biaOperationalImpact: form.biaOperationalImpact,
      biaReputationalImpact: form.biaReputationalImpact,
      biaRegulatoryImpact: form.biaRegulatoryImpact,
      biaMaxTolerableDowntime: form.biaMaxTolerableDowntime,
      biaAssessmentDate: form.biaAssessmentDate,
      testStatus: (last?.test_status as any) || form.testStatus,
      nextTestDate: next?.scheduled_date || form.nextTestDate,
      signedOffAt: form.signedOffAt,
    });
  }, [form]);

  const canSignOff = canSignOffBcp(user?.role);
  const canOverride = canOverrideBcpStatus(user?.role);

  /** Record or revoke the sign-off stamp that unlocks the Ready status. */
  const setSignOff = useCallback(
    (signed: boolean) => {
      if (!canSignOff) return;
      setForm((prev) => ({
        ...prev,
        signedOffAt: signed ? new Date().toISOString() : null,
        signedOffBy: signed ? user?.id || null : null,
      }));
    },
    [canSignOff, user?.id],
  );

  /** Toggle the ADMIN/CRO manual override of the derived status. */
  const setOverride = useCallback(
    (enabled: boolean) => {
      if (!canOverride) return;
      setForm((prev) => ({
        ...prev,
        statusOverride: enabled,
        statusOverrideReason: enabled ? prev.statusOverrideReason : '',
        status: enabled ? prev.status : prev.status,
      }));
    },
    [canOverride],
  );



  /** Persists the plan. Returns the plan id on success, null on failure. */
  const submit = useCallback(async (): Promise<string | null> => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast({
        title: 'Please fix the highlighted fields',
        description: `${Object.keys(errs).length} validation error(s) found.`,
        variant: 'destructive',
      });
      return null;
    }
    setErrors({});
    setSaving(true);
    try {
      if (planId) {
        const { error } = await supabase
          .from('business_continuity_plans')
          .update({ ...payload, last_updated_date: today() } as any)
          .eq('id', planId);
        if (error) throw error;
        await syncTests(planId, form.tests, existingTestIds);
        setExistingTestIds(form.tests.map((t) => t.id!).filter(Boolean));
        clearDraft();
        toast({ title: 'Plan updated', description: 'Changes saved and recorded in version history.' });
        return planId;

      }
      const { data, error } = await supabase
        .from('business_continuity_plans')
        .insert({ ...payload, created_by: user?.id } as any)
        .select('id')
        .single();
      if (error) throw error;
      const newId = (data as any)?.id as string | undefined;
      if (newId && form.tests.length) {
        await syncTests(newId, form.tests, []);
      }
      clearDraft();
      toast({ title: 'Plan created', description: 'Business continuity plan saved successfully.' });
      return (data as any)?.id ?? null;
    } catch (error: any) {
      const mapped = mapBcpServerError(error);
      if (Object.keys(mapped.fieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...mapped.fieldErrors }));
        toast({
          title: 'Server validation failed',
          description: 'Please fix the highlighted fields and try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Save failed',
          description: mapped.generalMessage || 'Could not save the business continuity plan.',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [validate, planId, payload, user?.id, toast, clearDraft, form.tests, existingTestIds]);

  const errorSteps = useMemo(() => {
    const steps = new Set<number>();
    for (const key of Object.keys(errors)) {
      if (key.startsWith('tests.')) { steps.add(3); continue; }
      const s = FIELD_STEP[key];
      if (s !== undefined) steps.add(s);
    }
    return steps;
  }, [errors]);

  return {
    form,
    setField,
    errors,
    errorSteps,
    owners,
    loading,
    saving,
    submit,
    validateStep,
    clearDraft,
    discardDraft,
    restoreDraft,
    dismissDraft,
    pendingDraft,
    draftSavedAt,
    isEdit: !!planId,
    derivedStatus,
    canSignOff,
    canOverride,
    setSignOff,
    setOverride,


  };
}
