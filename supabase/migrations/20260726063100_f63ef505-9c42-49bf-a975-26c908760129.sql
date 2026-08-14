-- Idempotent re-evaluation of risk appetite rules
CREATE OR REPLACE FUNCTION public.reevaluate_risk_appetite(
  p_risk_type public.risk_type DEFAULT NULL,
  p_category  public.risk_category DEFAULT NULL,
  p_segment   text DEFAULT NULL,
  p_actor     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r            RECORD;
  v_score      integer;
  v_appetite   RECORD;
  v_segment    text;
  v_actor      uuid := COALESCE(p_actor, auth.uid());
  v_is_leader  boolean;
  v_already    boolean;
  v_scanned    int := 0;
  v_actioned   int := 0;
  v_escalated  int := 0;
  v_flagged    int := 0;
  v_notified   int := 0;
  v_msg        text;
BEGIN
  -- AuthZ: only RMD/CRO/ADMIN may invoke (except when called via trigger with NULL actor).
  IF v_actor IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = v_actor
        AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[])
    ) INTO v_is_leader;
    IF NOT COALESCE(v_is_leader, false) THEN
      RAISE EXCEPTION 'Only RMD, CRO, or ADMIN may re-evaluate risk appetite'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR r IN
    SELECT id, title, risk_reference, risk_type, category, taxpayer_segment,
           residual_likelihood, residual_impact, status, flagged_for_audit,
           owner_id, created_by, assigned_to_id
      FROM public.risks
     WHERE approval_status = 'Approved'
       AND (p_risk_type IS NULL OR risk_type = p_risk_type)
       AND (p_category  IS NULL OR category  = p_category)
       AND (p_segment   IS NULL OR taxpayer_segment = p_segment)
  LOOP
    v_scanned := v_scanned + 1;
    v_score := COALESCE(r.residual_likelihood,0) * COALESCE(r.residual_impact,0);
    v_segment := CASE WHEN r.risk_type = 'compliance' THEN r.taxpayer_segment ELSE NULL END;

    SELECT * INTO v_appetite
      FROM public.resolve_risk_appetite(r.risk_type, r.category, v_segment);

    IF v_appetite.id IS NULL OR v_score < v_appetite.threshold_score THEN
      CONTINUE;
    END IF;

    -- Idempotency: skip if we've already recorded an exceedance at the same
    -- threshold for this risk (regardless of who triggered it) AND the risk
    -- already reflects the configured action.
    SELECT EXISTS (
      SELECT 1 FROM public.system_audit_logs sal
      WHERE sal.resource_type = 'risk'
        AND sal.resource_id   = r.id
        AND sal.action        = 'risk_exceeded_appetite'
        AND (sal.details->>'threshold_score')::int = v_appetite.threshold_score
    ) INTO v_already;

    IF v_already
       AND (
         (v_appetite.escalation_action = 'escalate'    AND r.status = 'Escalated')
         OR (v_appetite.escalation_action = 'flag_audit' AND r.flagged_for_audit = true)
         OR (v_appetite.escalation_action = 'notify')
       )
    THEN
      CONTINUE;
    END IF;

    -- Apply the escalation action (idempotent state writes).
    IF v_appetite.escalation_action = 'escalate' AND r.status <> 'Escalated' THEN
      UPDATE public.risks SET status = 'Escalated'::risk_status WHERE id = r.id;
      v_escalated := v_escalated + 1;
    ELSIF v_appetite.escalation_action = 'flag_audit' AND COALESCE(r.flagged_for_audit,false) = false THEN
      UPDATE public.risks SET flagged_for_audit = true WHERE id = r.id;
      v_flagged := v_flagged + 1;
    END IF;

    -- Notify + audit only when we don't have a prior record for this threshold.
    IF NOT v_already THEN
      v_msg := 'Risk "' || r.title || '" (' || COALESCE(r.risk_reference,'-') ||
               ') residual score ' || v_score || ' has exceeded the configured ' ||
               v_appetite.tolerance_level || ' appetite threshold (' ||
               v_appetite.threshold_score || ').';

      INSERT INTO public.notifications
        (user_id, title, message, type, category, resource_type, resource_id, metadata)
      SELECT DISTINCT p.user_id,
             'Risk exceeds appetite threshold',
             v_msg,
             'warning',
             'risk_update',
             'risk',
             r.id,
             jsonb_build_object(
               'threshold_score', v_appetite.threshold_score,
               'risk_score', v_score,
               'tolerance_level', v_appetite.tolerance_level,
               'escalation_action', v_appetite.escalation_action,
               'source', 'reevaluate_risk_appetite'
             )
        FROM public.profiles p
        LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
       WHERE p.user_id IN (r.owner_id, r.created_by, r.assigned_to_id)
          OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]);

      PERFORM public.log_system_audit(
        v_actor,
        'risk_exceeded_appetite',
        'data_modification',
        'risk',
        r.id,
        jsonb_build_object(
          'risk_reference', r.risk_reference,
          'risk_score', v_score,
          'threshold_score', v_appetite.threshold_score,
          'tolerance_level', v_appetite.tolerance_level,
          'escalation_action', v_appetite.escalation_action,
          'source', 'reevaluate_risk_appetite'
        ),
        'high'
      );
      v_notified := v_notified + 1;
    END IF;

    v_actioned := v_actioned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned',   v_scanned,
    'actioned',  v_actioned,
    'escalated', v_escalated,
    'flagged',   v_flagged,
    'notified',  v_notified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reevaluate_risk_appetite(public.risk_type, public.risk_category, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reevaluate_risk_appetite(public.risk_type, public.risk_category, text, uuid) TO authenticated;

-- Auto re-scan when appetite rules are added or their impact-relevant fields change.
CREATE OR REPLACE FUNCTION public.rescan_on_appetite_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_should_rescan boolean := false;
  v_target public.risk_appetite_config;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target := NEW;
    v_should_rescan := NEW.is_active;
  ELSIF TG_OP = 'UPDATE' THEN
    v_target := NEW;
    v_should_rescan :=
         NEW.is_active
     AND (
          OLD.is_active         IS DISTINCT FROM NEW.is_active
       OR OLD.threshold_score   IS DISTINCT FROM NEW.threshold_score
       OR OLD.escalation_action IS DISTINCT FROM NEW.escalation_action
       OR OLD.category          IS DISTINCT FROM NEW.category
       OR OLD.taxpayer_segment  IS DISTINCT FROM NEW.taxpayer_segment
       OR OLD.risk_type         IS DISTINCT FROM NEW.risk_type
     );
  END IF;

  IF v_should_rescan THEN
    -- NULL actor => called by the system trigger, skips the RMD/CRO/ADMIN check.
    PERFORM public.reevaluate_risk_appetite(
      v_target.risk_type,
      v_target.category,
      v_target.taxpayer_segment,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rescan_on_appetite_config_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rescan_on_appetite_change ON public.risk_appetite_config;
CREATE TRIGGER trg_rescan_on_appetite_change
AFTER INSERT OR UPDATE ON public.risk_appetite_config
FOR EACH ROW EXECUTE FUNCTION public.rescan_on_appetite_config_change();