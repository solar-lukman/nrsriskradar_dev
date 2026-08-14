-- BCP version history table for BIA / test detail edits
CREATE TABLE IF NOT EXISTS public.bcp_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bcp_id UUID NOT NULL REFERENCES public.business_continuity_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','updated')),
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcp_version_history_bcp_id ON public.bcp_version_history(bcp_id);
CREATE INDEX IF NOT EXISTS idx_bcp_version_history_performed_at ON public.bcp_version_history(performed_at DESC);

ALTER TABLE public.bcp_version_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/RMD/CRO view all BCP version history" ON public.bcp_version_history;
CREATE POLICY "Admin/RMD/CRO view all BCP version history"
ON public.bcp_version_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN','RMD','CRO']::public.user_role[])
  )
);

DROP POLICY IF EXISTS "Owners view their BCP version history" ON public.bcp_version_history;
CREATE POLICY "Owners view their BCP version history"
ON public.bcp_version_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_continuity_plans b
    WHERE b.id = bcp_version_history.bcp_id
      AND (b.owner_id = auth.uid() OR b.created_by = auth.uid())
  )
);

-- Trigger function that snapshots BIA / test fields on every change
CREATE OR REPLACE FUNCTION public.record_bcp_version_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tracked TEXT[] := ARRAY[
    'bia_criticality_rating',
    'bia_financial_impact',
    'bia_operational_impact',
    'bia_reputational_impact',
    'bia_regulatory_impact',
    'bia_max_tolerable_downtime',
    'bia_assessment_date',
    'test_type',
    'test_scope',
    'test_results',
    'test_findings'
  ];
  before_jsonb JSONB := '{}'::jsonb;
  after_jsonb  JSONB := '{}'::jsonb;
  changed TEXT[] := ARRAY[]::TEXT[];
  k TEXT;
  v_before JSONB;
  v_after  JSONB;
  full_old JSONB;
  full_new JSONB;
BEGIN
  full_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    full_old := to_jsonb(OLD);
  ELSE
    full_old := '{}'::jsonb;
  END IF;

  FOREACH k IN ARRAY tracked LOOP
    v_after  := full_new -> k;
    v_before := CASE WHEN TG_OP = 'UPDATE' THEN full_old -> k ELSE NULL END;
    IF TG_OP = 'INSERT' THEN
      after_jsonb := after_jsonb || jsonb_build_object(k, v_after);
      IF v_after IS NOT NULL AND v_after <> 'null'::jsonb THEN
        changed := array_append(changed, k);
      END IF;
    ELSIF v_before IS DISTINCT FROM v_after THEN
      before_jsonb := before_jsonb || jsonb_build_object(k, v_before);
      after_jsonb  := after_jsonb  || jsonb_build_object(k, v_after);
      changed := array_append(changed, k);
    END IF;
  END LOOP;

  -- Skip pure no-op updates
  IF TG_OP = 'UPDATE' AND array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.bcp_version_history (
    bcp_id, action, changed_fields, before_values, after_values, performed_by
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    changed,
    before_jsonb,
    after_jsonb,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_bcp_version_history_trg ON public.business_continuity_plans;
CREATE TRIGGER record_bcp_version_history_trg
AFTER INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.record_bcp_version_history();