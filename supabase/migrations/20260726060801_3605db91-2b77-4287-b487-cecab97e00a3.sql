
-- 1. Extend notification_preferences with in-app category toggles + quiet hours
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS risk_updates_in_app     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bcp_changes_in_app      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_uploads_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS system_alerts_in_app    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approvals_in_app        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appetite_in_app         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start       time    NOT NULL DEFAULT '22:00'::time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end         time    NOT NULL DEFAULT '07:00'::time;

-- 2. Extend the existing incident audit trigger so an owner change also fans out
--    notifications carrying the audit_log_id (for timeline deep-link + highlight).
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
  v_audit_id uuid;
  v_actor uuid := auth.uid();
  v_from_owner uuid;
  v_to_owner   uuid;
  v_recipient  uuid;
  v_from_name  text;
  v_to_name    text;
  v_title      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(v_actor, NEW.reported_by),
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
      v_audit_id := public.log_system_audit(
        v_actor,
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

      -- Fan out owner-change notifications with the audit log id embedded.
      IF v_changes ? 'owner_id' THEN
        v_from_owner := NULLIF(v_changes->'owner_id'->>'from','')::uuid;
        v_to_owner   := NULLIF(v_changes->'owner_id'->>'to','')::uuid;
        SELECT full_name INTO v_from_name FROM public.profiles WHERE user_id = v_from_owner;
        SELECT full_name INTO v_to_name   FROM public.profiles WHERE user_id = v_to_owner;
        v_title := NEW.title;

        FOR v_recipient IN
          SELECT DISTINCT p.user_id
          FROM public.profiles p
          LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
          WHERE p.user_id = v_from_owner
             OR p.user_id = v_to_owner
             OR ur.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[])
        LOOP
          IF v_recipient IS NULL OR v_recipient = v_actor THEN
            CONTINUE;
          END IF;
          INSERT INTO public.notifications
            (user_id, title, message, type, category, resource_type, resource_id, metadata)
          VALUES (
            v_recipient,
            'Incident owner reassigned',
            'Incident "' || COALESCE(v_title,'-') || '" (' || COALESCE(NEW.reference_number,'-') ||
              ') owner changed from ' || COALESCE(v_from_name,'unassigned') ||
              ' to ' || COALESCE(v_to_name,'unassigned') || '.',
            'warning',
            'user_action',
            'incident',
            NEW.id,
            jsonb_build_object(
              'action', 'incident_owner_changed',
              'audit_log_id', v_audit_id,
              'from_owner_id', v_from_owner,
              'to_owner_id',   v_to_owner,
              'reference_number', NEW.reference_number
            )
          );
        END LOOP;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      v_actor,
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
