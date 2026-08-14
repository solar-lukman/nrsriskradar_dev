
-- 1. GRANTs on critical tables (missing entirely in prod)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risks TO service_role;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.board_report_archives TO service_role;
GRANT ALL ON public.risk_events TO service_role;

-- 2. Prevent profile role self-escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.user_has_role(auth.uid(), 'ADMIN'::user_role) THEN
      RAISE EXCEPTION 'Only administrators can change a profile role'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_self_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_role_self_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_self_escalation();

-- 3. backup_logs: restrict UPDATE to admins only
DROP POLICY IF EXISTS "System can update backup logs" ON public.backup_logs;
CREATE POLICY "Admins can update backup logs" ON public.backup_logs
FOR UPDATE TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::user_role))
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::user_role));

-- 4. Remove overly permissive INSERT policies on system log tables.
--    Inserts still succeed because they go through SECURITY DEFINER
--    functions owned by postgres (which bypasses RLS).
DROP POLICY IF EXISTS "System can insert backup logs" ON public.backup_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.system_audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "System insert risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Authorized insert approval history" ON public.approval_history;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Try common names for the remaining log-table insert policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('user_activity_logs','user_login_history','whistleblow_audit_log')
      AND cmd='INSERT'
      AND with_check = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 5. bcp_schema_check_logs: scope insert to self
DROP POLICY IF EXISTS "Authenticated can insert schema checks" ON public.bcp_schema_check_logs;
CREATE POLICY "Users can insert their own schema checks" ON public.bcp_schema_check_logs
FOR INSERT TO authenticated
WITH CHECK (checked_by IS NULL OR checked_by = auth.uid());

-- 6. Function search_path hardening (16 flagged functions)
ALTER FUNCTION public.create_bcp_audit_log()          SET search_path = public;
ALTER FUNCTION public.create_risk_audit_log()         SET search_path = public;
ALTER FUNCTION public.get_backup_status_summary()     SET search_path = public;
ALTER FUNCTION public.get_user_role(uuid)             SET search_path = public;
ALTER FUNCTION public.increment_discussion_views()    SET search_path = public;
ALTER FUNCTION public.log_system_audit(uuid, text, text, text, uuid, jsonb, text) SET search_path = public;
ALTER FUNCTION public.log_user_activity(uuid, text, text, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.notify_bcp_change()             SET search_path = public;
ALTER FUNCTION public.notify_document_upload()        SET search_path = public;
ALTER FUNCTION public.notify_risk_update()            SET search_path = public;
ALTER FUNCTION public.schedule_backup_operation(uuid, text, uuid) SET search_path = public;
ALTER FUNCTION public.send_notification(uuid, text, text, text, text, text, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.update_discussion_stats()       SET search_path = public;
ALTER FUNCTION public.update_updated_at_column()      SET search_path = public;
ALTER FUNCTION public.user_has_role(uuid, user_role)  SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='get_user_roles') THEN
    EXECUTE 'ALTER FUNCTION public.get_user_roles(uuid) SET search_path = public';
  END IF;
END $$;
