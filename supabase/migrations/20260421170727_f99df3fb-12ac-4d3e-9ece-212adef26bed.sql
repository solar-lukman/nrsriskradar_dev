-- Phase 4: Risk Appetite & Tolerance

CREATE TABLE public.risk_appetite_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category public.risk_category,
  risk_type public.risk_type NOT NULL,
  taxpayer_segment TEXT,
  tolerance_level TEXT NOT NULL,
  threshold_score INTEGER NOT NULL CHECK (threshold_score BETWEEN 1 AND 25),
  escalation_action TEXT NOT NULL DEFAULT 'notify',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup index (no immutability issue — only column refs)
CREATE INDEX idx_risk_appetite_lookup
  ON public.risk_appetite_config (risk_type, category, taxpayer_segment)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.risk_appetite_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view appetite config"
  ON public.risk_appetite_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage appetite config"
  ON public.risk_appetite_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
    )
  );

CREATE TRIGGER trg_risk_appetite_config_updated_at
  BEFORE UPDATE ON public.risk_appetite_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve most specific appetite for a risk
CREATE OR REPLACE FUNCTION public.resolve_risk_appetite(
  p_risk_type public.risk_type,
  p_category public.risk_category,
  p_taxpayer_segment TEXT
)
RETURNS TABLE (
  id UUID,
  tolerance_level TEXT,
  threshold_score INTEGER,
  escalation_action TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rac.id, rac.tolerance_level, rac.threshold_score, rac.escalation_action
  FROM public.risk_appetite_config rac
  WHERE rac.is_active = true
    AND rac.risk_type = p_risk_type
    AND (rac.category IS NULL OR rac.category = p_category)
    AND (
      rac.taxpayer_segment IS NULL
      OR (p_taxpayer_segment IS NOT NULL AND rac.taxpayer_segment = p_taxpayer_segment)
    )
  ORDER BY
    (rac.category IS NOT NULL)::int DESC,
    (rac.taxpayer_segment IS NOT NULL)::int DESC,
    rac.threshold_score ASC
  LIMIT 1;
$$;

-- Auto-escalation trigger
CREATE OR REPLACE FUNCTION public.enforce_risk_appetite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER;
  v_old_score INTEGER;
  v_appetite RECORD;
  v_segment TEXT;
  v_msg TEXT;
BEGIN
  IF NEW.approval_status <> 'Approved' THEN
    RETURN NEW;
  END IF;

  v_score := COALESCE(NEW.residual_likelihood, 0) * COALESCE(NEW.residual_impact, 0);

  IF TG_OP = 'UPDATE' THEN
    v_old_score := COALESCE(OLD.residual_likelihood, 0) * COALESCE(OLD.residual_impact, 0);
  ELSE
    v_old_score := 0;
  END IF;

  v_segment := CASE WHEN NEW.risk_type = 'compliance' THEN NEW.taxpayer_segment ELSE NULL END;

  SELECT * INTO v_appetite
  FROM public.resolve_risk_appetite(NEW.risk_type, NEW.category, v_segment);

  IF v_appetite.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_score >= v_appetite.threshold_score AND v_old_score < v_appetite.threshold_score THEN
    v_msg := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference, '-') ||
             ') residual score ' || v_score || ' has exceeded the configured ' ||
             v_appetite.tolerance_level || ' appetite threshold (' || v_appetite.threshold_score || ').';

    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id, metadata)
    SELECT DISTINCT p.user_id,
      'Risk exceeds appetite threshold',
      v_msg,
      'warning',
      'risk_update',
      'risk',
      NEW.id,
      jsonb_build_object(
        'threshold_score', v_appetite.threshold_score,
        'risk_score', v_score,
        'tolerance_level', v_appetite.tolerance_level,
        'escalation_action', v_appetite.escalation_action
      )
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id IN (NEW.owner_id, NEW.created_by, NEW.assigned_to_id)
       OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]);

    IF v_appetite.escalation_action = 'escalate' AND NEW.status <> 'Escalated' THEN
      NEW.status := 'Escalated'::risk_status;
    ELSIF v_appetite.escalation_action = 'flag_audit' THEN
      NEW.flagged_for_audit := true;
    END IF;

    PERFORM public.log_system_audit(
      auth.uid(),
      'risk_exceeded_appetite',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object(
        'risk_reference', NEW.risk_reference,
        'risk_score', v_score,
        'threshold_score', v_appetite.threshold_score,
        'tolerance_level', v_appetite.tolerance_level,
        'escalation_action', v_appetite.escalation_action
      ),
      'high'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_risk_appetite
  BEFORE INSERT OR UPDATE OF residual_likelihood, residual_impact, approval_status, category, taxpayer_segment
  ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_risk_appetite();

-- Seed defaults
INSERT INTO public.risk_appetite_config (risk_type, category, taxpayer_segment, tolerance_level, threshold_score, escalation_action, description)
VALUES
  ('institutional', NULL, NULL, 'Medium', 12, 'notify',     'Default institutional appetite — notify when residual score ≥ 12'),
  ('institutional', 'Strategic', NULL, 'Low', 9, 'escalate', 'Strategic risks escalate at score ≥ 9'),
  ('institutional', 'Financial', NULL, 'Medium', 12, 'escalate', 'Financial risks escalate at score ≥ 12'),
  ('institutional', 'Operational', NULL, 'Medium', 15, 'notify', 'Operational risks notify at score ≥ 15'),
  ('compliance', NULL, 'Large',    'Low',     8,  'escalate',   'Large taxpayers — low tolerance, escalate at ≥ 8'),
  ('compliance', NULL, 'Medium',   'Medium',  12, 'notify',     'Medium taxpayers — notify at ≥ 12'),
  ('compliance', NULL, 'Emerging', 'High',    16, 'flag_audit', 'Emerging taxpayers — flag for audit at ≥ 16');