import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, ArrowRight, ArrowLeft, Check, ShieldAlert, ShieldOff, Repeat, HandCoins, AlertTriangle, CalendarClock, Sparkles, Edit, Save, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { VALID_RISK_STATUSES, type RiskStatus } from '@/lib/riskWorkflow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ClickableRiskMatrix } from './ClickableRiskMatrix';
import { AIScoreIndicator } from './AIScoreIndicator';
import { MitigationRecommendationsDialog } from './MitigationRecommendationsDialog';
import { MitigationTasksPanel } from './MitigationTasksPanel';
import { RiskAttachmentsPanel } from './RiskAttachmentsPanel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRiskCategories } from '@/hooks/useRiskCategories';

interface Risk {
  id: string;
  title: string;
  description: string;
  category: string;
  department: string;
  owner_id: string;
  assigned_to_id: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  status: string;
  treatment_strategy: string | null;
  strategic_objective: string | null;
  review_frequency: string | null;
  flagged_for_audit: boolean;
  consecutive_high_assessments: number;
  mitigation_plan: string;
  mitigation_actions: any;
  target_date: string;
  review_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  inherent_likelihood_rationale?: string | null;
  inherent_impact_rationale?: string | null;
  residual_likelihood_rationale?: string | null;
  residual_impact_rationale?: string | null;
  mitigation_budget?: number | null;
  mitigation_budget_spent?: number | null;
  mitigation_budget_currency?: string | null;
  ai_recommended_likelihood?: number | null;
  ai_recommended_impact?: number | null;
  ai_confidence?: number | null;
  ai_score_reasoning?: string | null;
  ai_score_status?: string | null;
}

type RiskTypeValue = 'institutional' | 'compliance';

interface RiskWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  risk?: Risk | null;
  /** Determines which register the new risk belongs to. Ignored in edit mode. */
  defaultRiskType?: RiskTypeValue;
}

// Fallback constants — used only if the database lookup fails to load.
// The authoritative list lives in `public.risk_categories` and is fetched via useRiskCategories().
const INSTITUTIONAL_CATEGORIES_FALLBACK = [
  'Strategic', 'Operational', 'Financial', 'Compliance',
  'Technology', 'Reputational', 'Environmental', 'Human Resources'
];

const COMPLIANCE_CATEGORIES_FALLBACK = [
  'Registration', 'Filing', 'Disclosure/Reporting', 'Payment'
];

const TAX_TYPES = [
  'Companies Income Tax (CIT)',
  'Personal Income Tax (PIT)',
  'Value Added Tax (VAT)',
  'Withholding Tax (WHT)',
  'Petroleum Profits Tax (PPT)',
  'Capital Gains Tax (CGT)',
  'Stamp Duties',
  'Education Tax',
  'Tertiary Education Tax',
  'Excise Duties',
  'Customs Duties',
  'Other',
];

const TAXPAYER_SEGMENTS = [
  'Large Taxpayers',
  'Medium Taxpayers',
  'Emerging Taxpayers',
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Technology': ['cyber', 'hack', 'system', 'software', 'data breach', 'IT', 'network', 'server', 'cloud', 'phishing'],
  'Financial': ['budget', 'cost', 'revenue', 'fraud', 'money', 'financial', 'loss', 'investment', 'credit', 'liquidity'],
  'Compliance': ['regulatory', 'compliance', 'legal', 'law', 'regulation', 'audit', 'policy', 'gdpr', 'license'],
  'Operational': ['process', 'supply chain', 'vendor', 'operational', 'disruption', 'failure', 'outage', 'staff'],
  'Strategic': ['strategy', 'market', 'competition', 'expansion', 'merger', 'acquisition', 'growth'],
  'Reputational': ['reputation', 'brand', 'media', 'public', 'scandal', 'trust', 'image'],
  'Environmental': ['environment', 'climate', 'pollution', 'sustainability', 'disaster', 'flood', 'fire'],
  'Human Resources': ['employee', 'talent', 'retention', 'training', 'workforce', 'HR', 'staff turnover'],
};

const TREATMENT_STRATEGIES = [
  { value: 'Avoid', icon: ShieldAlert, description: 'Eliminate the risk by removing the cause', color: 'text-destructive' },
  { value: 'Mitigate', icon: ShieldOff, description: 'Reduce likelihood or impact through controls', color: 'text-primary' },
  { value: 'Transfer', icon: Repeat, description: 'Shift risk to a third party (insurance, outsourcing)', color: 'text-warning' },
  { value: 'Accept', icon: HandCoins, description: 'Acknowledge and monitor without active treatment', color: 'text-muted-foreground' },
];

function getSmartFrequency(score: number): string {
  if (score >= 20) return 'monthly';
  if (score >= 15) return 'monthly';
  if (score >= 8) return 'quarterly';
  return 'annually';
}

function getReviewDate(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case 'monthly': return addMonths(now, 1);
    case 'quarterly': return addMonths(now, 3);
    case 'semi-annual': return addMonths(now, 6);
    case 'annually': return addMonths(now, 12);
    default: return addMonths(now, 3);
  }
}

/** Strict client-side check that mirrors the `risk_status` Postgres enum. */
function isValidRiskStatusValue(value: unknown): value is RiskStatus {
  return typeof value === 'string' && (VALID_RISK_STATUSES as readonly string[]).includes(value);
}

/** Render a backend error in a way the user can act on (status code + Postgres detail). */
function formatBackendError(error: any): string {
  if (!error) return 'Unknown error';
  const parts: string[] = [];
  if (error.code) parts.push(`Code ${error.code}`);
  if (error.status) parts.push(`HTTP ${error.status}`);
  const msg = error.message || error.error_description || (typeof error === 'string' ? error : '');
  if (msg) parts.push(msg);
  if (error.details) parts.push(`Details: ${error.details}`);
  if (error.hint) parts.push(`Hint: ${error.hint}`);
  return parts.length ? parts.join(' · ') : 'Backend rejected the request.';
}

export function RiskWizardDialog({ open, onOpenChange, onSuccess, risk, defaultRiskType = 'institutional' }: RiskWizardDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditMode = !!risk;
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<number, string[]>>({});
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string; risk_reference: string | null; status: string; matchReason?: string }>>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [strategicObjectives, setStrategicObjectives] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [showMitigationDialog, setShowMitigationDialog] = useState(false);
  // Configurable mapping: treatment strategy → auto-set risk status (loaded from DB)
  const [strategyStatusMap, setStrategyStatusMap] = useState<Record<string, RiskStatus>>({
    Mitigate: 'In Review',
    Avoid: 'In Review',
    Transfer: 'In Review',
    Accept: 'New',
  });

  // Register type ('institutional' | 'compliance' — matches DB enum)
  const [riskType, setRiskType] = useState<RiskTypeValue>(defaultRiskType);

  // Authoritative category list — sourced from `risk_categories` table & filtered by current register
  const { categories: dbCategories } = useRiskCategories({ riskType, activeOnly: true });
  const categoryOptions = useMemo(() => {
    if (dbCategories.length > 0) return dbCategories.map(c => c.name);
    return riskType === 'compliance' ? COMPLIANCE_CATEGORIES_FALLBACK : INSTITUTIONAL_CATEGORIES_FALLBACK;
  }, [dbCategories, riskType]);

  // Step 1: Identification
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [strategicObjective, setStrategicObjective] = useState('');
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');

  // Compliance-specific fields
  const [taxType, setTaxType] = useState<string>('');
  const [estimatedTaxAtRisk, setEstimatedTaxAtRisk] = useState<number | undefined>();
  const [taxpayerSegment, setTaxpayerSegment] = useState<string>('');
  const [sector, setSector] = useState('');
  const [subSector, setSubSector] = useState('');
  const [complianceDescription, setComplianceDescription] = useState('');
  const [sourcesOfInformation, setSourcesOfInformation] = useState('');
  const [treatmentOwnerId, setTreatmentOwnerId] = useState('');
  const [monitoringOfficerId, setMonitoringOfficerId] = useState('');
  const [treatmentTimeline, setTreatmentTimeline] = useState('');

  // Step 2: Inherent Assessment
  const [likelihood, setLikelihood] = useState(0);
  const [impact, setImpact] = useState(0);
  const [inherentLikelihoodRationale, setInherentLikelihoodRationale] = useState('');
  const [inherentImpactRationale, setInherentImpactRationale] = useState('');

  // Step 3: Treatment + Residual Assessment
  const [treatmentStrategy, setTreatmentStrategy] = useState('');
  const [targetDate, setTargetDate] = useState<Date>();
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [transferDetails, setTransferDetails] = useState('');
  const [acceptRationale, setAcceptRationale] = useState('');
  const [mitigationBudget, setMitigationBudget] = useState<number | undefined>();
  const [mitigationBudgetSpent, setMitigationBudgetSpent] = useState<number | undefined>();
  const [mitigationBudgetCurrency, setMitigationBudgetCurrency] = useState('NGN');
  const [controlEffectivenessRating, setControlEffectivenessRating] = useState<string>('');
  // Residual
  const [residualLikelihood, setResidualLikelihood] = useState(0);
  const [residualImpact, setResidualImpact] = useState(0);
  const [residualLikelihoodRationale, setResidualLikelihoodRationale] = useState('');
  const [residualImpactRationale, setResidualImpactRationale] = useState('');

  // Step 4: Monitoring
  const [reviewFrequency, setReviewFrequency] = useState('');

  const inherentScore = likelihood * impact;
  const residualScore = residualLikelihood * residualImpact;

  // Pre-populate in edit mode
  useEffect(() => {
    if (risk && open) {
      const r: any = risk;
      const rawType = (r.risk_type ?? 'institutional').toString().toLowerCase();
      setRiskType((rawType === 'compliance' ? 'compliance' : 'institutional') as RiskTypeValue);
      setTitle(risk.title || '');
      setDescription(risk.description || '');
      setCategory(risk.category || '');
      setDepartment(risk.department || '');
      setStrategicObjective(risk.strategic_objective || '');
      setOwnerId(risk.owner_id || '');
      setAssignedToId(risk.assigned_to_id || '');
      setLikelihood(risk.inherent_likelihood || 0);
      setImpact(risk.inherent_impact || 0);
      setInherentLikelihoodRationale(risk.inherent_likelihood_rationale || '');
      setInherentImpactRationale(risk.inherent_impact_rationale || '');
      setTreatmentStrategy(risk.treatment_strategy || '');
      setMitigationPlan(risk.mitigation_plan || '');
      setMitigationBudget(risk.mitigation_budget ?? undefined);
      setMitigationBudgetSpent(risk.mitigation_budget_spent ?? undefined);
      setMitigationBudgetCurrency(risk.mitigation_budget_currency || 'NGN');
      setControlEffectivenessRating((r as any).control_effectiveness_rating || '');
      setTargetDate(risk.target_date ? new Date(risk.target_date) : undefined);
      setResidualLikelihood(risk.residual_likelihood || 0);
      setResidualImpact(risk.residual_impact || 0);
      setResidualLikelihoodRationale(risk.residual_likelihood_rationale || '');
      setResidualImpactRationale(risk.residual_impact_rationale || '');
      setReviewFrequency(risk.review_frequency || '');
      // Compliance fields — read from actual DB columns
      setTaxType(r.tax_type || '');
      setEstimatedTaxAtRisk(r.estimated_tax_at_risk ?? undefined);
      setTaxpayerSegment(r.taxpayer_segment || '');
      setSector(r.tax_sector || '');
      setSubSector(r.tax_sub_sector || '');
      setComplianceDescription(r.compliance_description || '');
      setSourcesOfInformation(r.information_sources || '');
      setTreatmentOwnerId(r.treatment_owner_id || '');
      setMonitoringOfficerId(r.monitoring_officer_id || '');
      setTreatmentTimeline(r.treatment_timeline || '');
    } else if (!risk && open) {
      setRiskType(defaultRiskType);
    }
  }, [risk, open, defaultRiskType]);

  // Auto-suggest category — only for institutional risks (compliance categories are tax-domain specific)
  useEffect(() => {
    if (isEditMode || riskType === 'compliance') { setSuggestedCategory(''); return; }
    const text = `${title} ${description}`.toLowerCase();
    if (!text.trim()) { setSuggestedCategory(''); return; }
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        setSuggestedCategory(cat);
        if (!category) setCategory(cat);
        return;
      }
    }
    setSuggestedCategory('');
  }, [title, description, isEditMode, riskType]);

  // Auto-set review frequency based on score (only if not already set)
  useEffect(() => {
    if (inherentScore > 0 && !reviewFrequency) {
      setReviewFrequency(getSmartFrequency(inherentScore));
    }
  }, [inherentScore]);

  // Invalidate stale duplicates when key fields change
  useEffect(() => {
    if (duplicates.length > 0) setDuplicates([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, riskType]);

  // Fetch lookup data
  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const [profilesRes, deptsRes, objRes, mapRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email, role, department').order('full_name'),
        supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
        supabase.from('strategic_objectives').select('id, name, description').eq('is_active', true).order('name'),
        supabase.from('treatment_strategy_status_map' as any).select('treatment_strategy, target_status, is_active'),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (deptsRes.data) setDepartments(deptsRes.data);
      if (objRes.data) setStrategicObjectives(objRes.data);
      if (mapRes && (mapRes as any).data) {
        const next: Record<string, RiskStatus> = { ...strategyStatusMap };
        for (const row of (mapRes as any).data as Array<{ treatment_strategy: string; target_status: string; is_active: boolean }>) {
          if (row.is_active && VALID_RISK_STATUSES.includes(row.target_status as RiskStatus)) {
            next[row.treatment_strategy] = row.target_status as RiskStatus;
          }
        }
        setStrategyStatusMap(next);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canProceed = () => {
    switch (currentStep) {
      case 1: {
        if (!title.trim() || !description.trim() || !category) return false;
        if (riskType === 'compliance' && !taxType) return false;
        return true;
      }
      case 2: return likelihood > 0 && impact > 0;
      case 3: {
        if (!treatmentStrategy) return false;
        if (treatmentStrategy === 'Mitigate' && !mitigationPlan.trim()) return false;
        if (treatmentStrategy === 'Accept' && !acceptRationale.trim()) return false;
        return true;
      }
      case 4: return !!reviewFrequency;
      default: return false;
    }
  };

  const getAutoStatus = (): RiskStatus => {
    const mapped = strategyStatusMap[treatmentStrategy];
    if (mapped && VALID_RISK_STATUSES.includes(mapped)) return mapped;
    return 'New';
  };

  const buildRiskData = (earlySave: boolean = false) => {
    const reviewDate = reviewFrequency ? getReviewDate(reviewFrequency) : getReviewDate('quarterly');
    const effectiveMitigationPlan = treatmentStrategy === 'Mitigate' ? mitigationPlan :
      treatmentStrategy === 'Transfer' ? transferDetails :
      treatmentStrategy === 'Accept' ? `Accepted: ${acceptRationale}` : null;

    const data: any = {
      risk_type: riskType,
      title,
      description,
      category: category as any,
      department: department || null,
      strategic_objective: strategicObjective || null,
      owner_id: ownerId || null,
      assigned_to_id: assignedToId || null,
      inherent_likelihood: likelihood,
      inherent_impact: impact,
      inherent_likelihood_rationale: inherentLikelihoodRationale || null,
      inherent_impact_rationale: inherentImpactRationale || null,
      review_date: format(reviewDate, 'yyyy-MM-dd'),
    };

    if (riskType === 'compliance') {
      data.tax_type = taxType || null;
      data.estimated_tax_at_risk = estimatedTaxAtRisk ?? null;
      data.taxpayer_segment = taxpayerSegment || null;
      data.tax_sector = sector || null;
      data.tax_sub_sector = subSector || null;
      data.compliance_description = complianceDescription || null;
      data.information_sources = sourcesOfInformation || null;
      data.treatment_owner_id = treatmentOwnerId || null;
      data.monitoring_officer_id = monitoringOfficerId || null;
      data.treatment_timeline = treatmentTimeline || null;
    }

    if (earlySave) {
      // Early save at step 2 - residual = inherent, no treatment
      data.residual_likelihood = likelihood;
      data.residual_impact = impact;
      data.status = 'New';
      data.review_frequency = 'quarterly';
      data.mitigation_actions = [];
    } else {
      data.treatment_strategy = treatmentStrategy;
      data.review_frequency = reviewFrequency;
      data.status = getAutoStatus() as any;
      data.mitigation_plan = effectiveMitigationPlan;
      data.target_date = targetDate ? format(targetDate, 'yyyy-MM-dd') : null;
      data.mitigation_budget = mitigationBudget || null;
      data.mitigation_budget_spent = mitigationBudgetSpent || null;
      data.mitigation_budget_currency = mitigationBudgetCurrency;
      data.control_effectiveness_rating = controlEffectivenessRating || null;
      data.residual_likelihood = residualLikelihood > 0 ? residualLikelihood : likelihood;
      data.residual_impact = residualImpact > 0 ? residualImpact : impact;
      data.residual_likelihood_rationale = residualLikelihoodRationale || null;
      data.residual_impact_rationale = residualImpactRationale || null;
      data.mitigation_actions = [];
    }

    return data;
  };

  const handleEarlySave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const riskData = { ...buildRiskData(true), created_by: user.id };
      // Pre-submit enum validation — block before hitting the DB
      if (!isValidRiskStatusValue(riskData.status)) {
        sonnerToast.error('Invalid risk status', {
          description: `"${riskData.status}" is not an allowed status. Update the Treatment Strategy → Status mapping in Settings.`,
        });
        setLoading(false);
        return;
      }
      const { error } = await supabase.from('risks').insert(riskData);
      if (error) throw error;
      sonnerToast.success('Risk created', { description: 'Saved as Draft for later completion.' });
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      sonnerToast.error('Failed to create risk', {
        description: formatBackendError(error),
      });
      console.error('Wizard early-save error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Normalize a title for fuzzy duplicate matching: lowercase, strip punctuation, collapse whitespace
  const normalizeTitle = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Compute step-by-step required-field issues. Returns map of step -> messages.
  const computeStepErrors = (): Record<number, string[]> => {
    const errs: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
    const t = title.trim();
    const d = description.trim();
    if (!t) errs[1].push('Risk title is required');
    else if (t.length < 5) errs[1].push('Title must be at least 5 characters');
    else if (t.length > 200) errs[1].push('Title must be 200 characters or less');
    if (!d) errs[1].push('Description is required');
    else if (d.length < 10) errs[1].push('Description must be at least 10 characters');
    if (!category) errs[1].push('Category is required');
    if (riskType === 'compliance' && !taxType) errs[1].push('Tax Type is required for compliance risks');

    if (likelihood < 1) errs[2].push('Inherent likelihood is required (click the matrix)');
    if (impact < 1) errs[2].push('Inherent impact is required (click the matrix)');

    if (!treatmentStrategy) errs[3].push('Treatment strategy is required');
    if (treatmentStrategy === 'Mitigate' && !mitigationPlan.trim()) errs[3].push('Mitigation plan is required');
    if (treatmentStrategy === 'Transfer' && !transferDetails.trim()) errs[3].push('Transfer details are required');
    if (treatmentStrategy === 'Accept' && !acceptRationale.trim()) errs[3].push('Acceptance rationale is required');

    if (!reviewFrequency) errs[4].push('Review frequency is required');
    return errs;
  };

  const handleSubmit = async (force: boolean = false) => {
    if (!user) return;

    // Required-field validation across all steps
    const errs = computeStepErrors();
    setStepErrors(errs);
    const firstBadStep = [1, 2, 3, 4].find((n) => errs[n].length > 0);
    if (firstBadStep) {
      setCurrentStep(firstBadStep);
      sonnerToast.error('Please complete required fields', {
        description: `Step ${firstBadStep}: ${errs[firstBadStep][0]}`,
      });
      return;
    }

    setLoading(true);
    try {
      // Duplicate check (create mode only): fuzzy title + risk_reference within same risk_type
      if (!isEditMode && !force) {
        const t = title.trim();
        const normalized = normalizeTitle(t);
        // Pull a wider candidate set, then filter client-side for normalized matches
        const tokens = normalized.split(' ').filter((w) => w.length > 3).slice(0, 4);
        let query = supabase
          .from('risks')
          .select('id, title, risk_reference, status')
          .eq('risk_type', riskType as any)
          .limit(50);

        // Server-side ilike pre-filter (matches if any significant token appears)
        if (tokens.length > 0) {
          const orParts = [
            `title.ilike.%${t}%`,
            ...tokens.map((tok) => `title.ilike.%${tok}%`),
          ];
          query = query.or(orParts.join(','));
        } else {
          query = query.ilike('title', `%${t}%`);
        }

        const { data: candidates } = await query;

        const matches: Array<{ id: string; title: string; risk_reference: string | null; status: string; matchReason: string }> = [];
        (candidates || []).forEach((c: any) => {
          const cn = normalizeTitle(c.title || '');
          if (!cn) return;
          if (cn === normalized) {
            matches.push({ ...c, matchReason: 'Exact title match' });
            return;
          }
          // Token-overlap score (Jaccard-like)
          const aSet = new Set(normalized.split(' ').filter((w) => w.length > 2));
          const bSet = new Set(cn.split(' ').filter((w) => w.length > 2));
          if (aSet.size === 0 || bSet.size === 0) return;
          const intersection = [...aSet].filter((w) => bSet.has(w)).length;
          const union = new Set([...aSet, ...bSet]).size;
          const score = intersection / union;
          if (score >= 0.6) {
            matches.push({ ...c, matchReason: `Similar title (${Math.round(score * 100)}% overlap)` });
          } else if (cn.includes(normalized) || normalized.includes(cn)) {
            matches.push({ ...c, matchReason: 'Title contains the same wording' });
          }
        });

        const unique = Array.from(new Map(matches.map((m) => [m.id, m])).values()).slice(0, 5);
        if (unique.length > 0) {
          setDuplicates(unique);
          setLoading(false);
          setCurrentStep(1);
          toast({
            title: 'Possible duplicate risk',
            description: 'Review the matching risks shown on Step 1, or press "Submit Anyway".',
            variant: 'destructive',
          });
          return;
        }
      }

      if (isEditMode && risk) {
        const updateData = buildRiskData(false);
        delete updateData.mitigation_actions;
        if (!isValidRiskStatusValue(updateData.status)) {
          sonnerToast.error('Invalid risk status', {
            description: `Status "${updateData.status}" is not in the allowed list (${VALID_RISK_STATUSES.join(', ')}). Adjust the strategy mapping in Settings → Risk Management.`,
          });
          setLoading(false);
          return;
        }
        const { error } = await supabase.from('risks').update(updateData).eq('id', risk.id);
        if (error) throw error;
        sonnerToast.success('Risk updated', {
          description: `${riskType === 'compliance' ? 'Compliance' : 'Institutional'} risk "${title}" saved successfully.`,
        });
      } else {
        const riskData = { ...buildRiskData(false), created_by: user.id };
        if (!isValidRiskStatusValue(riskData.status)) {
          sonnerToast.error('Invalid risk status', {
            description: `Status "${riskData.status}" is not in the allowed list (${VALID_RISK_STATUSES.join(', ')}). Adjust the strategy mapping in Settings → Risk Management.`,
          });
          setLoading(false);
          return;
        }
        const { error } = await supabase.from('risks').insert(riskData);
        if (error) throw error;
        sonnerToast.success(
          `${riskType === 'compliance' ? 'Compliance' : 'Institutional'} risk submitted`,
          { description: `"${title}" was created with status "${riskData.status}".` },
        );
      }
      onSuccess();
      onOpenChange(false);
      resetForm();
      setDuplicates([]);
      setStepErrors({});
    } catch (error: any) {
      console.error('Wizard submit error:', error);
      sonnerToast.error(`Failed to ${isEditMode ? 'update' : 'submit'} ${riskType} risk`, {
        description: formatBackendError(error),
        duration: 8000,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setRiskType(defaultRiskType);
    setTitle(''); setDescription(''); setCategory(''); setDepartment('');
    setStrategicObjective(''); setOwnerId(''); setAssignedToId('');
    setLikelihood(0); setImpact(0);
    setInherentLikelihoodRationale(''); setInherentImpactRationale('');
    setTreatmentStrategy(''); setTargetDate(undefined);
    setMitigationPlan(''); setTransferDetails(''); setAcceptRationale('');
    setMitigationBudget(undefined); setMitigationBudgetSpent(undefined); setMitigationBudgetCurrency('NGN');
    setResidualLikelihood(0); setResidualImpact(0);
    setResidualLikelihoodRationale(''); setResidualImpactRationale('');
    setReviewFrequency('');
    setTaxType(''); setEstimatedTaxAtRisk(undefined); setTaxpayerSegment('');
    setSector(''); setSubSector(''); setComplianceDescription(''); setSourcesOfInformation('');
    setTreatmentOwnerId(''); setMonitoringOfficerId(''); setTreatmentTimeline('');
    setStepErrors({});
    setDuplicates([]);
  };

  const steps = [
    { num: 1, label: 'Identify' },
    { num: 2, label: 'Assess' },
    { num: 3, label: 'Treat' },
    { num: 4, label: 'Monitor' },
  ];

  // In edit mode, allow free navigation between steps
  const handleStepClick = (stepNum: number) => {
    if (isEditMode) {
      setCurrentStep(stepNum);
    }
  };

  const showResidualAssessment = isEditMode || !!treatmentStrategy;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isEditMode ? <Edit className="w-5 h-5 text-primary" /> : <Wand2 className="w-5 h-5 text-primary" />}
              {isEditMode ? 'Edit Risk' : 'Add Risk'}
            </div>
            {isEditMode && risk && (
              <div className="flex items-center gap-2">
                <AIScoreIndicator
                  riskId={risk.id}
                  currentLikelihood={risk.residual_likelihood}
                  currentImpact={risk.residual_impact}
                  aiRecommendedLikelihood={risk.ai_recommended_likelihood ?? null}
                  aiRecommendedImpact={risk.ai_recommended_impact ?? null}
                  aiConfidence={risk.ai_confidence ?? null}
                  aiReasoning={risk.ai_score_reasoning ?? null}
                  aiStatus={risk.ai_score_status ?? null}
                  onScoreApplied={onSuccess}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-primary hover:bg-primary/10"
                  onClick={() => setShowMitigationDialog(true)}
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="text-xs">AI Mitigation</span>
                </Button>
              </div>
            )}
          </DialogTitle>
          <DialogDescription>
            Step {currentStep} of 4 — {steps[currentStep - 1].label}
          </DialogDescription>
        </DialogHeader>

        {/* Flagged for audit banner */}
        {isEditMode && risk?.flagged_for_audit && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Flagged for Audit Review</span> — Residual risk has been high for {risk.consecutive_high_assessments || 2}+ consecutive assessments
          </div>
        )}

        {/* Progress stepper */}
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, i) => (
            <React.Fragment key={step.num}>
              <div
                className={cn('flex flex-col items-center gap-1', isEditMode && 'cursor-pointer')}
                onClick={() => handleStepClick(step.num)}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  currentStep > step.num ? 'bg-success text-success-foreground' :
                  currentStep === step.num ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                )}>
                  {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
                </div>
                <span className="text-[10px] text-muted-foreground">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-2', currentStep > step.num ? 'bg-success' : 'bg-muted')} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Identification */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {stepErrors[1]?.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Please fix {stepErrors[1].length} issue{stepErrors[1].length > 1 ? 's' : ''} on this step</p>
                    <ul className="list-disc pl-4 mt-1 text-xs text-destructive/90 space-y-0.5">
                      {stepErrors[1].map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {duplicates.length > 0 && (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">Possible duplicate risk{duplicates.length > 1 ? 's' : ''} detected</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Open a match to compare, or press <strong>Submit Anyway</strong> on Step 4 if this is a separate risk.
                    </p>
                  </div>
                </div>
                <ul className="space-y-1 pl-6">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm bg-background rounded border px-2 py-1.5">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{d.title}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                          {d.risk_reference && <span className="font-mono">{d.risk_reference}</span>}
                          <span>· {d.status}</span>
                          {d.matchReason && <span className="italic">· {d.matchReason}</span>}
                        </div>
                      </div>
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 shrink-0">
                        <Link to={`/risk-register?focus=${d.id}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Register type banner */}
            <div className={cn(
              'p-3 rounded-lg border text-sm flex items-center justify-between gap-3',
              riskType === 'compliance'
                ? 'bg-warning/15 border-warning/40 text-foreground'
                : 'bg-primary/5 border-primary/20 text-foreground'
            )}>
              <span className="font-semibold text-foreground">
                {riskType === 'compliance' ? '📋 Compliance Risk Register' : '🏛️ Institutional Risk Register'}
              </span>
              {!isEditMode && (
                <Select value={riskType} onValueChange={(v) => { setRiskType(v as RiskTypeValue); setCategory(''); }}>
                  <SelectTrigger className="w-[180px] h-8 text-xs bg-background text-foreground border-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institutional">Institutional</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              {riskType === 'compliance'
                ? '📋 Describe the taxpayer compliance risk (e.g. under-reporting, late filing, evasion).'
                : '💬 What happened or could happen? Describe the risk in your own words.'}
            </div>
            <div>
              <Label>Risk Title *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={riskType === 'compliance'
                  ? 'e.g., Under-declaration of VAT by large retailers'
                  : 'e.g., Cybersecurity breach in customer database'}
              />
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what could go wrong, what triggers it, and who's affected..." rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                {riskType === 'institutional' && suggestedCategory && suggestedCategory !== category && (
                  <Badge variant="outline" className="ml-2 text-[10px] cursor-pointer" onClick={() => setCategory(suggestedCategory)}>
                    Suggested: {suggestedCategory}
                  </Badge>
                )}
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Compliance-specific fields */}
            {riskType === 'compliance' && (
              <div className="space-y-4 p-4 rounded-lg border border-warning/30 bg-warning/5">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Compliance Details
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tax Type *</Label>
                    <Select value={taxType} onValueChange={setTaxType}>
                      <SelectTrigger><SelectValue placeholder="Select tax type" /></SelectTrigger>
                      <SelectContent>
                        {TAX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Taxpayer Segment</Label>
                    <Select value={taxpayerSegment} onValueChange={setTaxpayerSegment}>
                      <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                      <SelectContent>
                        {TAXPAYER_SEGMENTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Estimated Tax at Risk (₦)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={estimatedTaxAtRisk ?? ''}
                    onChange={e => setEstimatedTaxAtRisk(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Estimated revenue exposure in Nigerian Naira</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Sector</Label>
                    <Input value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g., Oil & Gas" />
                  </div>
                  <div>
                    <Label>Sub-Sector</Label>
                    <Input value={subSector} onChange={e => setSubSector(e.target.value)} placeholder="e.g., Upstream" />
                  </div>
                </div>

                <div>
                  <Label>Compliance Description</Label>
                  <Textarea
                    value={complianceDescription}
                    onChange={e => setComplianceDescription(e.target.value)}
                    placeholder="Specific non-compliance pattern, obligation breached, etc."
                    rows={2}
                  />
                </div>

                <div>
                  <Label>Sources of Information</Label>
                  <Textarea
                    value={sourcesOfInformation}
                    onChange={e => setSourcesOfInformation(e.target.value)}
                    placeholder="Audit reports, third-party data, whistleblower tips, etc."
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Treatment Owner</Label>
                    <Select value={treatmentOwnerId} onValueChange={setTreatmentOwnerId}>
                      <SelectTrigger><SelectValue placeholder="Officer executing treatment" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Monitoring Officer</Label>
                    <Select value={monitoringOfficerId} onValueChange={setMonitoringOfficerId}>
                      <SelectTrigger><SelectValue placeholder="Officer monitoring progress" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.role})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Treatment Timeline</Label>
                  <Input
                    value={treatmentTimeline}
                    onChange={e => setTreatmentTimeline(e.target.value)}
                    placeholder="e.g., Q3 2026, 90 days, immediate"
                  />
                </div>
              </div>
            )}

            {riskType === 'institutional' && (
              <div>
                <Label>Strategic Objective</Label>
                <Select value={strategicObjective} onValueChange={setStrategicObjective}>
                  <SelectTrigger><SelectValue placeholder="Link to a corporate objective" /></SelectTrigger>
                  <SelectContent>
                    {strategicObjectives.map(o => (
                      <SelectItem key={o.id} value={o.name}>
                        {o.name}
                        {o.description && <span className="text-muted-foreground ml-1">— {o.description}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Link this risk to a corporate objective for board-level visibility</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Risk Owner</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned To</Label>
                <Select value={assignedToId} onValueChange={setAssignedToId}>
                  <SelectTrigger><SelectValue placeholder="Assign to user" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Inherent Assessment */}
        {currentStep === 2 && (
          <div className="space-y-4">
            {stepErrors[2]?.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Please fix {stepErrors[2].length} issue{stepErrors[2].length > 1 ? 's' : ''} on this step</p>
                    <ul className="list-disc pl-4 mt-1 text-xs text-destructive/90 space-y-0.5">
                      {stepErrors[2].map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              📊 How bad is it, and how likely is it? Click a cell on the matrix below.
            </div>
            <ClickableRiskMatrix
              selectedLikelihood={likelihood}
              selectedImpact={impact}
              onSelect={(l, i) => { setLikelihood(l); setImpact(i); }}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Inherent Likelihood Rationale</Label>
                <Textarea
                  value={inherentLikelihoodRationale}
                  onChange={e => setInherentLikelihoodRationale(e.target.value)}
                  placeholder="Explain why this likelihood rating was chosen..."
                  rows={2}
                />
              </div>
              <div>
                <Label>Inherent Impact Rationale</Label>
                <Textarea
                  value={inherentImpactRationale}
                  onChange={e => setInherentImpactRationale(e.target.value)}
                  placeholder="Explain why this impact rating was chosen..."
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Treatment + Residual */}
        {currentStep === 3 && (
          <div className="space-y-4">
            {stepErrors[3]?.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Please fix {stepErrors[3].length} issue{stepErrors[3].length > 1 ? 's' : ''} on this step</p>
                    <ul className="list-disc pl-4 mt-1 text-xs text-destructive/90 space-y-0.5">
                      {stepErrors[3].map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              🛡️ What are we doing about it? Select a treatment strategy.
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TREATMENT_STRATEGIES.map(s => (
                <Card
                  key={s.value}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    treatmentStrategy === s.value ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                  )}
                  onClick={() => setTreatmentStrategy(s.value)}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <s.icon className={cn('w-6 h-6', s.color)} />
                    <div className="font-medium text-sm">{s.value}</div>
                    <p className="text-[11px] text-muted-foreground">{s.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {treatmentStrategy === 'Mitigate' && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                <div>
                  <Label>Mitigation Plan *</Label>
                  <Textarea value={mitigationPlan} onChange={e => setMitigationPlan(e.target.value)} placeholder="Describe the actions to reduce this risk..." rows={3} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Budget Allocated</Label>
                    <Input type="number" step="0.01" value={mitigationBudget ?? ''} onChange={e => setMitigationBudget(e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Budget Spent</Label>
                    <Input type="number" step="0.01" value={mitigationBudgetSpent ?? ''} onChange={e => setMitigationBudgetSpent(e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={mitigationBudgetCurrency} onValueChange={setMitigationBudgetCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NGN">NGN (₦)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Target Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {targetDate ? format(targetDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} initialFocus className="pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {treatmentStrategy === 'Transfer' && (
              <div className="p-4 bg-muted/30 rounded-lg border">
                <Label>Transfer Details *</Label>
                <Textarea value={transferDetails} onChange={e => setTransferDetails(e.target.value)} placeholder="Insurance policy, outsourcing details, etc." rows={3} />
              </div>
            )}

            {treatmentStrategy === 'Accept' && (
              <div className="p-4 bg-muted/30 rounded-lg border">
                <Label>Acceptance Rationale *</Label>
                <Textarea value={acceptRationale} onChange={e => setAcceptRationale(e.target.value)} placeholder="Why is it acceptable to leave this risk untreated?" rows={3} />
              </div>
            )}

            {treatmentStrategy && treatmentStrategy !== 'Accept' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3" />
                Status will be automatically set to "In Review"
              </div>
            )}

            {/* Control Effectiveness Rating - applies to all treatment strategies */}
            {treatmentStrategy && (
              <div className="space-y-2 p-4 rounded-lg border bg-muted/20">
                <Label className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-primary" />
                  Control Effectiveness Rating
                </Label>
                <p className="text-xs text-muted-foreground">
                  How effective are the existing or planned controls at reducing this risk?
                </p>
                <Select value={controlEffectivenessRating} onValueChange={setControlEffectivenessRating}>
                  <SelectTrigger><SelectValue placeholder="Select effectiveness" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High — Controls fully address the risk</SelectItem>
                    <SelectItem value="Medium">Medium — Controls partially address the risk</SelectItem>
                    <SelectItem value="Low">Low — Controls are weak or unproven</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Residual Assessment - only visible after treatment is selected */}
            {showResidualAssessment && treatmentStrategy && (
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-semibold">Residual Assessment (after treatment)</h4>
                <ClickableRiskMatrix
                  selectedLikelihood={residualLikelihood}
                  selectedImpact={residualImpact}
                  onSelect={(l, i) => { setResidualLikelihood(l); setResidualImpact(i); }}
                  label="Residual Risk Score"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Residual Likelihood Rationale</Label>
                    <Textarea
                      value={residualLikelihoodRationale}
                      onChange={e => setResidualLikelihoodRationale(e.target.value)}
                      placeholder="Explain the residual likelihood after treatment..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Residual Impact Rationale</Label>
                    <Textarea
                      value={residualImpactRationale}
                      onChange={e => setResidualImpactRationale(e.target.value)}
                      placeholder="Explain the residual impact after treatment..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mitigation Tasks - edit mode only */}
            {isEditMode && risk && (
              <div className="pt-4 border-t">
                <MitigationTasksPanel riskId={risk.id} compact />
              </div>
            )}

            {/* Attach Evidence - edit mode only */}
            {isEditMode && risk && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-xs gap-1 mt-2">
                    📎 Attach Evidence
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <RiskAttachmentsPanel riskId={risk.id} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {/* Step 4: Monitoring */}
        {currentStep === 4 && (
          <div className="space-y-4">
            {stepErrors[4]?.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Please fix {stepErrors[4].length} issue{stepErrors[4].length > 1 ? 's' : ''} on this step</p>
                    <ul className="list-disc pl-4 mt-1 text-xs text-destructive/90 space-y-0.5">
                      {stepErrors[4].map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <CalendarClock className="w-4 h-4 inline mr-1" />
              When should we check this again? Based on the risk score of <strong>{inherentScore}</strong>, we suggest:
            </div>

            <div>
              <Label>Review Frequency</Label>
              <Select value={reviewFrequency} onValueChange={setReviewFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
              {reviewFrequency === getSmartFrequency(inherentScore) && (
                <p className="text-xs text-success mt-1">✓ Recommended based on risk score</p>
              )}
            </div>

            {reviewFrequency && (
              <div className="text-sm text-muted-foreground">
                Next review: <strong>{format(getReviewDate(reviewFrequency), 'PPP')}</strong>
              </div>
            )}

            {/* Summary card */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Title:</span> {title}</div>
                  <div><span className="text-muted-foreground">Category:</span> <Badge variant="outline">{category}</Badge></div>
                  <div><span className="text-muted-foreground">Inherent Score:</span> <Badge variant={inherentScore >= 15 ? 'destructive' : inherentScore >= 8 ? 'default' : 'secondary'}>{inherentScore}</Badge></div>
                  <div><span className="text-muted-foreground">Treatment:</span> {treatmentStrategy || 'N/A'}</div>
                  {residualScore > 0 && (
                    <div><span className="text-muted-foreground">Residual Score:</span> <Badge variant={residualScore >= 15 ? 'destructive' : residualScore >= 8 ? 'default' : 'secondary'}>{residualScore}</Badge></div>
                  )}
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{getAutoStatus()}</Badge></div>
                  <div><span className="text-muted-foreground">Review:</span> {reviewFrequency}</div>
                  {controlEffectivenessRating && (
                    <div><span className="text-muted-foreground">Control Effectiveness:</span> <Badge variant="outline">{controlEffectivenessRating}</Badge></div>
                  )}
                  {strategicObjective && <div className="col-span-2"><span className="text-muted-foreground">Strategic Objective:</span> {strategicObjective}</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2">
          {currentStep > 1 && (
            <Button type="button" variant="outline" onClick={() => setCurrentStep(s => s - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          <div className="flex-1" />

          {/* Early save button at Step 2 (create mode only) */}
          {currentStep === 2 && !isEditMode && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleEarlySave}
              disabled={loading || !canProceed()}
            >
              <Save className="w-4 h-4 mr-1" />
              {loading ? 'Saving...' : 'Create Risk Now'}
            </Button>
          )}

          {currentStep < 4 ? (
            <Button type="button" onClick={() => setCurrentStep(s => s + 1)} disabled={!canProceed()}>
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : duplicates.length > 0 && !isEditMode ? (
            <Button type="button" variant="destructive" onClick={() => handleSubmit(true)} disabled={loading}>
              {loading ? 'Saving...' : 'Submit Anyway'}
            </Button>
          ) : (
            <Button type="button" onClick={() => handleSubmit(false)} disabled={loading || !canProceed()}>
              {loading ? 'Saving...' : isEditMode ? 'Update Risk' : 'Create Risk'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {isEditMode && risk && showMitigationDialog && (
      <MitigationRecommendationsDialog
        open={showMitigationDialog}
        onOpenChange={setShowMitigationDialog}
        riskId={risk.id}
        riskTitle={risk.title}
      />
    )}
    </>
  );
}
