-- 1) Schema check audit table
CREATE TABLE IF NOT EXISTS public.bcp_schema_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by UUID,
  status TEXT NOT NULL CHECK (status IN ('ok','missing_columns','error')),
  missing_columns TEXT[] DEFAULT '{}',
  error_message TEXT,
  client_info JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bcp_schema_check_logs_checked_at
  ON public.bcp_schema_check_logs(checked_at DESC);

ALTER TABLE public.bcp_schema_check_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can insert schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Authenticated can insert schema checks"
ON public.bcp_schema_check_logs
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admin/RMD/CRO can view schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Admin/RMD/CRO can view schema checks"
ON public.bcp_schema_check_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN','RMD','CRO']::public.user_role[])
  )
);

-- 2) Server-side validation trigger for BIA / test detail fields
CREATE OR REPLACE FUNCTION public.validate_bcp_bia_test_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criticality rating
  IF NEW.bia_criticality_rating IS NOT NULL
     AND NEW.bia_criticality_rating NOT IN ('Critical','High','Medium','Low') THEN
    RAISE EXCEPTION 'bia_criticality_rating must be one of Critical, High, Medium, Low (got: %)', NEW.bia_criticality_rating
      USING ERRCODE = 'check_violation';
  END IF;

  -- Financial impact: non-negative
  IF NEW.bia_financial_impact IS NOT NULL AND NEW.bia_financial_impact < 0 THEN
    RAISE EXCEPTION 'bia_financial_impact must be zero or positive (got: %)', NEW.bia_financial_impact
      USING ERRCODE = 'check_violation';
  END IF;

  -- MTD: non-negative integer hours, capped at 5 years
  IF NEW.bia_max_tolerable_downtime IS NOT NULL THEN
    IF NEW.bia_max_tolerable_downtime < 0 THEN
      RAISE EXCEPTION 'bia_max_tolerable_downtime must be zero or positive (got: %)', NEW.bia_max_tolerable_downtime
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.bia_max_tolerable_downtime > 43800 THEN
      RAISE EXCEPTION 'bia_max_tolerable_downtime is unreasonably large (got: % hours, max 43800)', NEW.bia_max_tolerable_downtime
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Assessment date cannot be in the future
  IF NEW.bia_assessment_date IS NOT NULL AND NEW.bia_assessment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'bia_assessment_date cannot be in the future (got: %)', NEW.bia_assessment_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Text length sanity
  IF NEW.bia_operational_impact IS NOT NULL AND length(NEW.bia_operational_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_operational_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bia_reputational_impact IS NOT NULL AND length(NEW.bia_reputational_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_reputational_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bia_regulatory_impact IS NOT NULL AND length(NEW.bia_regulatory_impact) > 2000 THEN
    RAISE EXCEPTION 'bia_regulatory_impact exceeds 2000 characters' USING ERRCODE = 'check_violation';
  END IF;

  -- Test type: allow null or one of known values
  IF NEW.test_type IS NOT NULL
     AND NEW.test_type NOT IN ('Tabletop Exercise','Walkthrough','Simulation','Full Test') THEN
    RAISE EXCEPTION 'test_type must be one of Tabletop Exercise, Walkthrough, Simulation, Full Test (got: %)', NEW.test_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.test_scope IS NOT NULL AND length(NEW.test_scope) > 1000 THEN
    RAISE EXCEPTION 'test_scope exceeds 1000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.test_results IS NOT NULL AND length(NEW.test_results) > 4000 THEN
    RAISE EXCEPTION 'test_results exceeds 4000 characters' USING ERRCODE = 'check_violation';
  END IF;

  -- test_findings must be a JSON array
  IF NEW.test_findings IS NOT NULL AND jsonb_typeof(NEW.test_findings) <> 'array' THEN
    RAISE EXCEPTION 'test_findings must be a JSON array' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bcp_bia_test_fields_trg ON public.business_continuity_plans;
CREATE TRIGGER validate_bcp_bia_test_fields_trg
BEFORE INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.validate_bcp_bia_test_fields();