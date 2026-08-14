
-- Phase 1a: Add columns to risks table
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS treatment_strategy text DEFAULT 'Mitigate',
  ADD COLUMN IF NOT EXISTS strategic_objective text,
  ADD COLUMN IF NOT EXISTS review_frequency text DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS flagged_for_audit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consecutive_high_assessments integer DEFAULT 0;

-- Phase 1b: Add 'In Treatment' to risk_status enum
ALTER TYPE public.risk_status ADD VALUE IF NOT EXISTS 'In Treatment';

-- Phase 1c: Create risk_history table
CREATE TABLE IF NOT EXISTS public.risk_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL DEFAULT 'update',
  change_summary text
);

ALTER TABLE public.risk_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view risk history"
  ON public.risk_history FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "System can insert risk history"
  ON public.risk_history FOR INSERT
  WITH CHECK (true);

-- Phase 1d: Create trigger to populate risk_history on every update
CREATE OR REPLACE FUNCTION public.record_risk_history()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.risk_history (risk_id, snapshot, changed_by, change_type, change_summary)
  VALUES (
    OLD.id,
    to_jsonb(OLD),
    auth.uid(),
    'update',
    CASE
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Status changed from ' || OLD.status || ' to ' || NEW.status
      WHEN OLD.residual_likelihood IS DISTINCT FROM NEW.residual_likelihood OR OLD.residual_impact IS DISTINCT FROM NEW.residual_impact
        THEN 'Risk score updated'
      WHEN OLD.treatment_strategy IS DISTINCT FROM NEW.treatment_strategy THEN 'Treatment strategy changed to ' || NEW.treatment_strategy
      ELSE 'Record updated'
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_risk_history
  BEFORE UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.record_risk_history();

-- Phase 1e: Create trigger for auto-audit flagging
CREATE OR REPLACE FUNCTION public.check_consecutive_high_risk()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_score integer;
BEGIN
  v_score := NEW.residual_likelihood * NEW.residual_impact;
  IF v_score >= 15 THEN
    NEW.consecutive_high_assessments := COALESCE(OLD.consecutive_high_assessments, 0) + 1;
    IF NEW.consecutive_high_assessments >= 2 THEN
      NEW.flagged_for_audit := true;
    END IF;
  ELSE
    NEW.consecutive_high_assessments := 0;
    NEW.flagged_for_audit := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_high_risk
  BEFORE UPDATE ON public.risks
  FOR EACH ROW
  WHEN (OLD.residual_likelihood IS DISTINCT FROM NEW.residual_likelihood
     OR OLD.residual_impact IS DISTINCT FROM NEW.residual_impact)
  EXECUTE FUNCTION public.check_consecutive_high_risk();
