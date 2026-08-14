ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS signed_off_by uuid,
  ADD COLUMN IF NOT EXISTS signed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_override_by uuid,
  ADD COLUMN IF NOT EXISTS status_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_override_reason text,
  ADD COLUMN IF NOT EXISTS status_derivation_reason text;

CREATE OR REPLACE FUNCTION public.bcp_bia_complete(p business_continuity_plans)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p.bia_criticality_rating, '') <> ''
     AND p.bia_financial_impact IS NOT NULL
     AND COALESCE(p.bia_operational_impact, '') <> ''
     AND COALESCE(p.bia_reputational_impact, '') <> ''
     AND COALESCE(p.bia_regulatory_impact, '') <> ''
     AND p.bia_max_tolerable_downtime IS NOT NULL
     AND p.bia_assessment_date IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.derive_bcp_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_privileged boolean := false;
  v_signer boolean := false;
  v_bia_complete boolean;
  v_status bcp_status;
  v_reason text;
BEGIN
  IF v_actor IS NOT NULL THEN
    v_privileged := public.user_has_role(v_actor, 'ADMIN'::user_role)
                 OR public.user_has_role(v_actor, 'CRO'::user_role);
    v_signer := v_privileged OR public.user_has_role(v_actor, 'RMD'::user_role);
  END IF;

  -- Guard the override switch: ADMIN / CRO only, reason mandatory.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_override AND NOT v_privileged THEN
      RAISE EXCEPTION 'BCP_STATUS_OVERRIDE_FORBIDDEN: only ADMIN or CRO may override the plan status';
    END IF;
  ELSE
    IF (NEW.status_override IS DISTINCT FROM OLD.status_override
        OR (NEW.status_override AND NEW.status IS DISTINCT FROM OLD.status)
        OR NEW.status_override_reason IS DISTINCT FROM OLD.status_override_reason)
       AND NOT v_privileged THEN
      RAISE EXCEPTION 'BCP_STATUS_OVERRIDE_FORBIDDEN: only ADMIN or CRO may override the plan status';
    END IF;
  END IF;

  IF NEW.status_override AND COALESCE(btrim(NEW.status_override_reason), '') = '' THEN
    RAISE EXCEPTION 'BCP_STATUS_OVERRIDE_REASON_REQUIRED: a reason is required when overriding the plan status';
  END IF;

  -- Guard sign-off: RMD / CRO / ADMIN only.
  IF NEW.signed_off_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.signed_off_at IS DISTINCT FROM OLD.signed_off_at)
     AND NOT v_signer THEN
    RAISE EXCEPTION 'BCP_SIGNOFF_FORBIDDEN: only RMD, CRO or ADMIN may sign off a continuity plan';
  END IF;

  IF NEW.signed_off_at IS NOT NULL AND NEW.signed_off_by IS NULL THEN
    NEW.signed_off_by := v_actor;
  END IF;

  IF NEW.status_override THEN
    IF TG_OP = 'INSERT' OR NOT COALESCE(OLD.status_override, false)
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.status_override_reason IS DISTINCT FROM OLD.status_override_reason THEN
      NEW.status_override_by := v_actor;
      NEW.status_override_at := now();
    END IF;
    NEW.status_derivation_reason := 'Manual override';
    RETURN NEW;
  END IF;

  NEW.status_override_by := NULL;
  NEW.status_override_at := NULL;
  NEW.status_override_reason := NULL;

  v_bia_complete := public.bcp_bia_complete(NEW);

  IF NEW.test_status = 'Failed'::test_status THEN
    v_status := 'Needs Review'::bcp_status;
    v_reason := 'Latest test failed — remediation required';
  ELSIF NOT v_bia_complete THEN
    v_status := 'Needs Review'::bcp_status;
    v_reason := 'Business impact assessment incomplete';
  ELSIF NEW.test_status = 'Overdue'::test_status
     OR (NEW.next_test_date IS NOT NULL AND NEW.next_test_date < CURRENT_DATE) THEN
    v_status := 'Outdated'::bcp_status;
    v_reason := 'Test schedule lapsed — next test date has passed';
  ELSIF NEW.signed_off_at IS NULL THEN
    v_status := 'Needs Review'::bcp_status;
    v_reason := 'Awaiting RMD/CRO/ADMIN sign-off';
  ELSIF NEW.test_status <> 'Passed'::test_status THEN
    v_status := 'Needs Review'::bcp_status;
    v_reason := 'No passed test recorded yet';
  ELSE
    v_status := 'Ready'::bcp_status;
    v_reason := 'BIA complete, test passed and signed off';
  END IF;

  -- A material change after sign-off invalidates it.
  IF TG_OP = 'UPDATE' AND OLD.signed_off_at IS NOT NULL
     AND NEW.signed_off_at = OLD.signed_off_at
     AND (NEW.test_status = 'Failed'::test_status OR NOT v_bia_complete) THEN
    NEW.signed_off_at := NULL;
    NEW.signed_off_by := NULL;
  END IF;

  NEW.status := v_status;
  NEW.status_derivation_reason := v_reason;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_bcp_status ON public.business_continuity_plans;
CREATE TRIGGER trg_derive_bcp_status
BEFORE INSERT OR UPDATE ON public.business_continuity_plans
FOR EACH ROW EXECUTE FUNCTION public.derive_bcp_status();