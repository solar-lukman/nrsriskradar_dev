-- Audit trigger for risk_events (incidents): log create/update/delete to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_risk_event_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_severity text := 'low';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(auth.uid(), NEW.reported_by),
      'incident_created',
      'data_modification',
      'incident',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'severity', NEW.severity,
        'status', NEW.status
      ),
      'medium'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- compute diff over a curated whitelist of fields
    FOR v_key IN SELECT unnest(ARRAY[
      'title','status','severity','risk_posture','event_date','discovered_date','resolution_date',
      'financial_impact','event_description','root_cause','immediate_response','operational_impact',
      'reputational_impact','lessons_learned','impact_amount','impact_description','resolution_notes'
    ]) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;

    IF v_changes <> '{}'::jsonb THEN
      IF (v_changes ? 'status') OR (v_changes ? 'severity') THEN
        v_severity := 'high';
      ELSE
        v_severity := 'medium';
      END IF;
      PERFORM public.log_system_audit(
        auth.uid(),
        'incident_updated',
        'data_modification',
        'incident',
        NEW.id,
        jsonb_build_object(
          'reference_number', NEW.reference_number,
          'title', NEW.title,
          'changes', v_changes
        ),
        v_severity
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'incident_deleted',
      'data_modification',
      'incident',
      OLD.id,
      jsonb_build_object('reference_number', OLD.reference_number, 'title', OLD.title),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_risk_events_audit ON public.risk_events;
CREATE TRIGGER trg_risk_events_audit
AFTER INSERT OR UPDATE OR DELETE ON public.risk_events
FOR EACH ROW EXECUTE FUNCTION public.log_risk_event_audit();

-- Allow authorized roles to read incident audit entries from system_audit_logs
DROP POLICY IF EXISTS "Authorized view incident audit logs" ON public.system_audit_logs;
CREATE POLICY "Authorized view incident audit logs"
ON public.system_audit_logs
FOR SELECT
TO authenticated
USING (
  resource_type = 'incident'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN','EC','ERMSC','RCB']::user_role[])
  )
);