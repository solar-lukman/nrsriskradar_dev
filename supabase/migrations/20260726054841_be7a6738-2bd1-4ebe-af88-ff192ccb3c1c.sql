
ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Backfill existing rows: default owner is the reporter
UPDATE public.risk_events
SET owner_id = reported_by
WHERE owner_id IS NULL;

-- Extend the incident audit trigger whitelist to include owner_id changes
CREATE OR REPLACE FUNCTION public.log_risk_event_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'status', NEW.status,
        'owner_id', NEW.owner_id
      ),
      'medium'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(ARRAY[
      'title','status','severity','risk_posture','event_date','discovered_date','resolution_date',
      'financial_impact','event_description','root_cause','immediate_response','operational_impact',
      'reputational_impact','lessons_learned','impact_amount','impact_description','resolution_notes',
      'owner_id'
    ]) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;

    IF v_changes <> '{}'::jsonb THEN
      IF (v_changes ? 'status') OR (v_changes ? 'severity') OR (v_changes ? 'owner_id') THEN
        v_severity := 'high';
      ELSE
        v_severity := 'medium';
      END IF;
      PERFORM public.log_system_audit(
        auth.uid(),
        CASE WHEN v_changes ? 'owner_id' AND (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1
             THEN 'incident_owner_changed'
             ELSE 'incident_updated' END,
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
$function$;
