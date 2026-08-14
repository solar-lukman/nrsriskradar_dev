
-- 1. Add pre_submission_status to risks
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS pre_submission_status public.risk_status NULL;

-- 2. Atomic workflow transition RPC
CREATE OR REPLACE FUNCTION public.apply_workflow_transition(
  p_risk_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_risk RECORD;
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_next_status public.risk_status;
  v_next_approval public.approval_status;
  v_log_action text := p_action;
  v_now timestamptz := now();
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_risk FROM public.risks WHERE id = p_risk_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk not found';
  END IF;

  SELECT role INTO v_actor_role FROM public.profiles WHERE user_id = v_actor;

  IF p_action = 'submit' THEN
    IF v_risk.approval_status NOT IN ('Draft','Returned') THEN
      RAISE EXCEPTION 'Cannot submit from %', v_risk.approval_status;
    END IF;
    v_next_status := 'Submitted'::public.risk_status;
    v_next_approval := 'Submitted'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      pre_submission_status = COALESCE(pre_submission_status, v_risk.status),
      submitted_at = v_now,
      submitted_by = v_actor,
      returned_at = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;

  ELSIF p_action = 'review' THEN
    IF v_risk.approval_status <> 'Submitted' THEN
      RAISE EXCEPTION 'Risk is not awaiting review (current: %)', v_risk.approval_status;
    END IF;
    v_next_status := 'In Review'::public.risk_status;
    v_next_approval := 'Under Review'::public.approval_status;
    -- Claim-lock: only succeed if no one has claimed yet
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      current_reviewer_id = v_actor,
      updated_at = v_now
    WHERE id = p_risk_id
      AND (current_reviewer_id IS NULL OR current_reviewer_id = v_actor);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'CLAIM_CONFLICT: This risk has already been claimed by another reviewer';
    END IF;
    v_log_action := 'reviewed';

  ELSIF p_action = 'approve' THEN
    IF v_risk.approval_status NOT IN ('Submitted','Under Review') THEN
      RAISE EXCEPTION 'Cannot approve from %', v_risk.approval_status;
    END IF;
    v_next_status := 'Approved'::public.risk_status;
    v_next_approval := 'Approved'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      approved_at = v_now,
      approved_by = v_actor,
      pre_submission_status = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'approved';

  ELSIF p_action IN ('return','reject') THEN
    IF v_risk.approval_status NOT IN ('Submitted','Under Review') THEN
      RAISE EXCEPTION 'Cannot return from %', v_risk.approval_status;
    END IF;
    -- Restore pre-submission lifecycle if available, else Draft
    v_next_status := COALESCE(v_risk.pre_submission_status, 'Draft'::public.risk_status);
    v_next_approval := 'Returned'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      returned_at = v_now,
      returned_by = v_actor,
      last_review_comment = p_reason,
      current_reviewer_id = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'returned';

  ELSIF p_action = 'withdraw' THEN
    IF v_risk.approval_status <> 'Submitted' THEN
      RAISE EXCEPTION 'Can only withdraw a Submitted risk';
    END IF;
    IF v_risk.current_reviewer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot withdraw — a reviewer has already claimed this risk';
    END IF;
    IF v_risk.submitted_by IS DISTINCT FROM v_actor AND v_risk.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Only the submitter or author can withdraw';
    END IF;
    v_next_status := COALESCE(v_risk.pre_submission_status, 'Draft'::public.risk_status);
    v_next_approval := 'Draft'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      submitted_at = NULL,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'withdrawn';

  ELSIF p_action = 'escalate' THEN
    IF v_risk.approval_status IN ('Approved') THEN
      RAISE EXCEPTION 'Cannot escalate an approved risk';
    END IF;
    v_next_status := 'Escalated'::public.risk_status;
    v_next_approval := 'Under Review'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'escalated';

  ELSIF p_action = 'deescalate' THEN
    IF v_actor_role NOT IN ('ADMIN','CRO','RMD') THEN
      RAISE EXCEPTION 'Only ADMIN, CRO or RMD can de-escalate';
    END IF;
    IF v_risk.status <> 'Escalated' THEN
      RAISE EXCEPTION 'Risk is not escalated';
    END IF;
    v_next_status := COALESCE(v_risk.pre_submission_status, 'In Review'::public.risk_status);
    v_next_approval := 'Under Review'::public.approval_status;
    UPDATE public.risks SET
      status = v_next_status,
      approval_status = v_next_approval,
      updated_at = v_now
    WHERE id = p_risk_id;
    v_log_action := 'deescalated';

  ELSE
    RAISE EXCEPTION 'Unknown workflow action: %', p_action;
  END IF;

  -- Atomic history log
  INSERT INTO public.approval_history (
    risk_id, action, from_status, to_status, actor_id, actor_role, comments, metadata
  ) VALUES (
    p_risk_id, v_log_action, v_risk.approval_status, v_next_approval, v_actor, v_actor_role, p_reason, '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'status', v_next_status,
    'approval_status', v_next_approval,
    'action', v_log_action
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_workflow_transition(uuid, text, text) TO authenticated;

-- 3. Approval inbox helper RPC
CREATE OR REPLACE FUNCTION public.get_approval_inbox()
RETURNS TABLE(
  id uuid,
  risk_reference text,
  title text,
  category public.risk_category,
  risk_type public.risk_type,
  department text,
  residual_score int,
  status public.risk_status,
  approval_status public.approval_status,
  submitted_at timestamptz,
  returned_at timestamptz,
  age_days numeric,
  submitter_name text,
  reviewer_id uuid,
  reviewer_name text,
  bucket text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role public.user_role;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE user_id = v_user;

  RETURN QUERY
  SELECT
    r.id,
    r.risk_reference,
    r.title,
    r.category,
    r.risk_type,
    r.department,
    (COALESCE(r.residual_likelihood,0) * COALESCE(r.residual_impact,0))::int AS residual_score,
    r.status,
    r.approval_status,
    r.submitted_at,
    r.returned_at,
    EXTRACT(EPOCH FROM (now() - COALESCE(r.returned_at, r.submitted_at, r.updated_at)))/86400 AS age_days,
    sp.full_name AS submitter_name,
    r.current_reviewer_id AS reviewer_id,
    rp.full_name AS reviewer_name,
    CASE
      WHEN r.approval_status = 'Returned'
        AND (r.submitted_by = v_user OR r.created_by = v_user) THEN 'returned_to_me'
      WHEN r.approval_status = 'Under Review'
        AND r.current_reviewer_id = v_user THEN 'reviewing'
      WHEN r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]) THEN 'awaiting_approval'
      WHEN r.approval_status = 'Under Review'
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]) THEN 'awaiting_approval'
      WHEN r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['RR','RMD','CRO','ADMIN']::public.user_role[]) THEN 'awaiting_review'
      ELSE NULL
    END AS bucket
  FROM public.risks r
  LEFT JOIN public.profiles sp ON sp.user_id = r.submitted_by
  LEFT JOIN public.profiles rp ON rp.user_id = r.current_reviewer_id
  WHERE
    (r.approval_status = 'Returned' AND (r.submitted_by = v_user OR r.created_by = v_user))
    OR (r.approval_status = 'Under Review' AND r.current_reviewer_id = v_user)
    OR (r.approval_status IN ('Submitted','Under Review')
        AND v_role = ANY(ARRAY['SUPERVISOR','CRO','RMD','ADMIN']::public.user_role[]))
    OR (r.approval_status = 'Submitted'
        AND v_role = ANY(ARRAY['RR','RMD','CRO','ADMIN']::public.user_role[]))
  ORDER BY COALESCE(r.returned_at, r.submitted_at, r.updated_at) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_approval_inbox() TO authenticated;
