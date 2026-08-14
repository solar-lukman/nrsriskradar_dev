
-- 1. BCP documents storage: restrict SELECT to users associated with the BCP
DROP POLICY IF EXISTS "Users can view BCP documents they have access to" ON storage.objects;
CREATE POLICY "Users can view BCP documents they have access to"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bcp-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role,'ERMSC'::user_role,'EC'::user_role,'RCB'::user_role])
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_continuity_plans b
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE (
        -- file path convention: <bcp_id>/... — match either by id prefix or by referenced plan
        position(b.id::text in name) = 1
      )
      AND (
        b.owner_id = auth.uid()
        OR b.created_by = auth.uid()
        OR (b.department IS NOT NULL AND b.department = p.department)
      )
    )
  )
);

-- 2. control_documents: restrict which columns non-admin owners can update
CREATE OR REPLACE FUNCTION public.enforce_control_document_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
  ) INTO v_is_admin;

  IF NOT COALESCE(v_is_admin, false) THEN
    IF NEW.owner_id      IS DISTINCT FROM OLD.owner_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.status     IS DISTINCT FROM OLD.status
       OR NEW.document_type IS DISTINCT FROM OLD.document_type
    THEN
      RAISE EXCEPTION 'Only RMD/CRO/ADMIN can change ownership, status, or document type on control documents'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_control_document_update_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_control_document_update_scope ON public.control_documents;
CREATE TRIGGER trg_enforce_control_document_update_scope
BEFORE UPDATE ON public.control_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_control_document_update_scope();

-- 3. whistleblow_cases: explicit block on anon writes (submission goes through edge function w/ service role)
DROP POLICY IF EXISTS "Block anon writes on whistleblow_cases" ON public.whistleblow_cases;
CREATE POLICY "Block anon writes on whistleblow_cases"
ON public.whistleblow_cases
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

REVOKE INSERT, UPDATE, DELETE ON public.whistleblow_cases FROM anon;

-- 4. Revoke EXECUTE from anon/authenticated on SECURITY DEFINER trigger functions
-- (trigger functions run under the trigger's context; direct EXECUTE is not needed)
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'assign_bcp_reference','assign_risk_event_reference','create_bcp_audit_log',
    'create_risk_audit_log','enforce_profile_department_admin_only','enforce_risk_appetite',
    'generate_risk_reference','handle_new_user','log_approval_status_audit',
    'log_bcp_status_audit','log_mitigation_task_insert','log_mitigation_task_status_change',
    'log_profile_role_change','log_profile_update_audit','log_risk_category_change',
    'log_risk_event_audit','log_risk_status_change','log_user_role_change',
    'notify_approval_status_change','prevent_profile_role_self_escalation',
    'prevent_risk_category_delete_if_in_use','record_bcp_version_history',
    'set_forum_updated_meta','sync_risk_category_enum','validate_bcp_bia_test_fields',
    'validate_mitigation_task_transition'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Also revoke from anon on internal helpers not intended for direct anon calls
REVOKE EXECUTE ON FUNCTION public.log_system_audit(uuid, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_user_activity(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_backup_operation(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_locked(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_auth_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_backup_status_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_approval_inbox() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_workflow_transition(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_approval_action(uuid, text, approval_status, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_password_change_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_risk(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_template_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.risk_category_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_risk_appetite(risk_type, risk_category, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_reference_number(text) FROM PUBLIC, anon;
