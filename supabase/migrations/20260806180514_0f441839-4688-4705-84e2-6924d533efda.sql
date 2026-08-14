
CREATE OR REPLACE FUNCTION public.create_bcp_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
      VALUES (NEW.id, 'created', to_jsonb(NEW), NEW.created_by);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_actor := COALESCE(auth.uid(), NEW.owner_id, NEW.created_by);
    IF v_actor IS NOT NULL THEN
      INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
      VALUES (NEW.id, 'updated', jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)), v_actor);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_actor := COALESCE(auth.uid(), OLD.owner_id, OLD.created_by);
    IF v_actor IS NOT NULL THEN
      INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
      VALUES (OLD.id, 'deleted', to_jsonb(OLD), v_actor);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

INSERT INTO public.bcp_tests (bcp_id, test_type, test_scope, test_results, test_status, performed_date, findings, created_at)
SELECT b.id,
       COALESCE(NULLIF(b.test_type, ''), 'Unspecified'),
       b.test_scope,
       b.test_results,
       CASE WHEN b.test_status::text IN ('Passed','Failed') THEN b.test_status::text ELSE 'Not Tested' END,
       b.last_tested_date,
       COALESCE(b.test_findings, '[]'::jsonb),
       now()
  FROM public.business_continuity_plans b
 WHERE b.last_tested_date IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.bcp_tests t WHERE t.bcp_id = b.id);

INSERT INTO public.bcp_tests (bcp_id, test_type, test_status, scheduled_date)
SELECT b.id, COALESCE(NULLIF(b.test_type, ''), 'Unspecified'), 'Scheduled', b.next_test_date
  FROM public.business_continuity_plans b
 WHERE b.next_test_date IS NOT NULL
   AND b.next_test_date >= CURRENT_DATE
   AND NOT EXISTS (SELECT 1 FROM public.bcp_tests t WHERE t.bcp_id = b.id AND t.test_status = 'Scheduled');
