-- ============================================================
-- Phase 3: Number Series & Approval Workflow
-- ============================================================

-- 1. Approval status enum
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('Draft', 'Submitted', 'Under Review', 'Approved', 'Returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. number_sequences table
CREATE TABLE IF NOT EXISTS public.number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  period_yymm TEXT NOT NULL,
  current_sequence INTEGER NOT NULL DEFAULT 0,
  pad_length INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, period_yymm)
);

ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view number sequences" ON public.number_sequences;
CREATE POLICY "Authenticated can view number sequences"
  ON public.number_sequences FOR SELECT TO authenticated USING (true);

-- writes happen exclusively through the SECURITY DEFINER function below

-- 3. Generic reference number generator
CREATE OR REPLACE FUNCTION public.generate_reference_number(p_entity_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_pad INTEGER := 3;
  v_yymm TEXT := to_char(now(), 'YYMM');
  v_seq INTEGER;
BEGIN
  v_prefix := CASE lower(p_entity_type)
    WHEN 'institutional_risk' THEN 'IR'
    WHEN 'compliance_risk' THEN 'CR'
    WHEN 'bcp' THEN 'BCP'
    WHEN 'incident' THEN 'INC'
    WHEN 'treatment_task' THEN 'TT'
    ELSE upper(substring(p_entity_type from 1 for 3))
  END;

  INSERT INTO public.number_sequences (entity_type, prefix, period_yymm, current_sequence, pad_length)
  VALUES (lower(p_entity_type), v_prefix, v_yymm, 1, v_pad)
  ON CONFLICT (entity_type, period_yymm)
  DO UPDATE SET current_sequence = number_sequences.current_sequence + 1, updated_at = now()
  RETURNING current_sequence INTO v_seq;

  RETURN v_prefix || v_yymm || lpad(v_seq::TEXT, v_pad, '0');
END;
$$;

-- 4. Update existing risks trigger to use the generic generator
CREATE OR REPLACE FUNCTION public.generate_risk_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity TEXT;
BEGIN
  IF NEW.risk_reference IS NOT NULL AND NEW.risk_reference <> '' THEN
    RETURN NEW;
  END IF;
  v_entity := CASE WHEN NEW.risk_type = 'compliance' THEN 'compliance_risk' ELSE 'institutional_risk' END;
  NEW.risk_reference := public.generate_reference_number(v_entity);
  RETURN NEW;
END;
$$;

-- ensure trigger exists
DROP TRIGGER IF EXISTS trg_risks_generate_reference ON public.risks;
CREATE TRIGGER trg_risks_generate_reference
  BEFORE INSERT ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.generate_risk_reference();

-- 5. Add reference_number to business_continuity_plans
ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE OR REPLACE FUNCTION public.assign_bcp_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_reference_number('bcp');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bcp_assign_reference ON public.business_continuity_plans;
CREATE TRIGGER trg_bcp_assign_reference
  BEFORE INSERT ON public.business_continuity_plans
  FOR EACH ROW EXECUTE FUNCTION public.assign_bcp_reference();

CREATE INDEX IF NOT EXISTS idx_bcp_reference_number ON public.business_continuity_plans(reference_number);

-- 6. Add reference_number to risk_events (incidents)
ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE OR REPLACE FUNCTION public.assign_risk_event_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR NEW.reference_number = '' THEN
    NEW.reference_number := public.generate_reference_number('incident');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_events_assign_reference ON public.risk_events;
CREATE TRIGGER trg_risk_events_assign_reference
  BEFORE INSERT ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.assign_risk_event_reference();

CREATE INDEX IF NOT EXISTS idx_risk_events_reference_number ON public.risk_events(reference_number);

-- 7. Approval workflow columns on risks
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS current_reviewer_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by UUID,
  ADD COLUMN IF NOT EXISTS last_review_comment TEXT;

CREATE INDEX IF NOT EXISTS idx_risks_approval_status ON public.risks(approval_status);

-- 8. approval_history table
CREATE TABLE IF NOT EXISTS public.approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- submitted, reviewed, approved, returned, escalated, reset_to_draft
  from_status public.approval_status,
  to_status public.approval_status NOT NULL,
  actor_id UUID NOT NULL,
  actor_role public.user_role,
  comments TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_history_risk_id ON public.approval_history(risk_id, created_at DESC);

ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized view approval history" ON public.approval_history;
CREATE POLICY "Authorized view approval history"
  ON public.approval_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

DROP POLICY IF EXISTS "Authorized insert approval history" ON public.approval_history;
CREATE POLICY "Authorized insert approval history"
  ON public.approval_history FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  );

-- 9. Workflow audit log view (joins approval_history with actor profile)
CREATE OR REPLACE VIEW public.risk_workflow_audit_view
WITH (security_invoker = true) AS
SELECT
  ah.id,
  ah.risk_id,
  ah.action,
  ah.from_status,
  ah.to_status,
  ah.actor_id,
  ah.actor_role,
  ah.comments,
  ah.metadata,
  ah.created_at,
  p.full_name AS actor_name,
  p.email AS actor_email,
  p.department AS actor_department,
  r.title AS risk_title,
  r.risk_reference
FROM public.approval_history ah
LEFT JOIN public.profiles p ON p.user_id = ah.actor_id
LEFT JOIN public.risks r ON r.id = ah.risk_id
ORDER BY ah.created_at DESC;

GRANT SELECT ON public.risk_workflow_audit_view TO authenticated;

-- 10. Helper RPC to log an approval action and update the risk atomically
CREATE OR REPLACE FUNCTION public.log_approval_action(
  p_risk_id UUID,
  p_action TEXT,
  p_to_status public.approval_status,
  p_comments TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.approval_status;
  v_actor_role public.user_role;
  v_id UUID;
BEGIN
  SELECT approval_status INTO v_from FROM public.risks WHERE id = p_risk_id;
  SELECT role INTO v_actor_role FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.approval_history (
    risk_id, action, from_status, to_status, actor_id, actor_role, comments, metadata
  ) VALUES (
    p_risk_id, p_action, v_from, p_to_status, auth.uid(), v_actor_role, p_comments, COALESCE(p_metadata,'{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;