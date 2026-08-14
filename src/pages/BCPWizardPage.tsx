import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { AccessDenied } from '@/components/AccessDenied';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ArrowLeft, ArrowRight, Save, X, FileDown, RotateCcw, CloudUpload } from 'lucide-react';
import { useBCPForm } from '@/hooks/useBCPForm';
import { exportBCPPlanToPDF } from '@/lib/bcpPdf';
import { WizardStepper, type WizardStep } from '@/components/bcp/wizard/WizardStepper';
import { StepBasics } from '@/components/bcp/wizard/StepBasics';
import { StepMitigation } from '@/components/bcp/wizard/StepMitigation';
import { StepBIA } from '@/components/bcp/wizard/StepBIA';
import { StepTest } from '@/components/bcp/wizard/StepTest';
import { StepReview } from '@/components/bcp/wizard/StepReview';

const STEPS: WizardStep[] = [
  { key: 'basics', label: 'Plan basics', hint: 'Title, department, RTO/RPO' },
  { key: 'actions', label: 'Mitigation actions', hint: 'What we do, who and when' },
  { key: 'bia', label: 'Impact assessment', hint: 'Criticality, impacts, MTD' },
  { key: 'test', label: 'Test log', hint: 'Type, scope and results' },
  { key: 'review', label: 'Review & save', hint: 'Confirm and track changes' },
];

export default function BCPWizardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [step, setStep] = useState(0);

  const hasAccess =
    hasPermission('manage_continuity') || ['RMD', 'CRO', 'ADMIN'].includes(user?.role || '');

  const {
    form, setField, errors, errorSteps, owners, loading, saving, submit, validateStep, isEdit,
    pendingDraft, restoreDraft, dismissDraft, discardDraft, draftSavedAt,
    derivedStatus, canSignOff, canOverride, setSignOff, setOverride,

  } = useBCPForm(id);

  const completed = useMemo(() => {
    const done = new Set<number>();
    if (form.title && form.department && form.businessFunction) done.add(0);
    if (form.mitigationActions.length > 0) done.add(1);
    if (form.biaAssessmentDate && form.biaCriticalityRating) done.add(2);
    if (form.tests.length > 0) done.add(3);
    return done;
  }, [form]);

  if (!user || !hasAccess) {
    return (
      <MainLayout>
        <AccessDenied message="This module is only available to RMD and critical department heads." />
      </MainLayout>
    );
  }

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSave = async () => {
    const savedId = await submit();
    if (savedId) navigate('/business-continuity');
  };

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {isEdit ? 'Edit continuity plan' : 'New continuity plan'}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Step {step + 1} of {STEPS.length} · {STEPS[step].label}
              </span>
              {draftSavedAt && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <CloudUpload className="h-3.5 w-3.5" /> Draft autosaved{' '}
                  {new Date(draftSavedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportBCPPlanToPDF(form)}>
              <FileDown className="mr-1 h-4 w-4" /> Export PDF
            </Button>
            <Button variant="outline" onClick={() => navigate('/business-continuity')}>
              <X className="mr-1 h-4 w-4" /> Close
            </Button>
          </div>
        </div>

        {pendingDraft && (
          <Alert>
            <RotateCcw className="h-4 w-4" />
            <AlertTitle>Unsaved draft found</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                We autosaved your progress on {new Date(pendingDraft.savedAt).toLocaleString()}.
              </span>
              <span className="flex gap-2">
                <Button size="sm" onClick={restoreDraft}>Restore draft</Button>
                <Button size="sm" variant="ghost" onClick={dismissDraft}>Keep current</Button>
                <Button size="sm" variant="ghost" onClick={discardDraft}>Discard draft</Button>
              </span>
            </AlertDescription>
          </Alert>
        )}

        <Progress value={progress} className="h-1.5" />

        <WizardStepper
          steps={STEPS}
          current={step}
          completed={completed}
          errored={errorSteps}
          onSelect={setStep}
        />

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {step === 0 && (
                  <StepBasics
                    form={form}
                    setField={setField}
                    errors={errors}
                    owners={owners}
                    derivedStatus={derivedStatus}
                    canSignOff={canSignOff}
                    canOverride={canOverride}
                    setSignOff={setSignOff}
                    setOverride={setOverride}
                  />

                )}
                {step === 1 && <StepMitigation form={form} setField={setField} />}
                {step === 2 && <StepBIA form={form} setField={setField} errors={errors} />}
                {step === 3 && (
                  <StepTest form={form} setField={setField} errors={errors} owners={owners} />
                )}
                {step === 4 && <StepReview form={form} onJump={setStep} planId={id} />}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            {step > 0 && step < STEPS.length - 1 && (
              <Button variant="ghost" onClick={() => setStep(STEPS.length - 1)}>
                Skip to review
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>
                Continue <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                {isEdit ? 'Save changes' : 'Create plan'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
