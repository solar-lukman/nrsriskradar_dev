-- =====================================================================
-- RiskRadar — On-Prem Delta Bundle
-- Generated: 2026-07-26
-- Contains: 20 migrations (files #92..#111 of supabase/migrations/)
-- Range: 20260708211953 .. 20260726064334
--
-- STRATEGY
--   The bundle is wrapped in a single transaction. Each migration body
--   is applied verbatim, then its filename is recorded in
--   public._onprem_migrations. If the whole transaction fails, nothing
--   is committed and no ledger rows are written.
--
--   Idempotency: application migrations here use IF NOT EXISTS / OR REPLACE
--   / DROP POLICY IF EXISTS where practical. If your on-prem DB is already
--   ahead of this cutoff, use the per-file loop in DATABASE-MIGRATIONS.md
--   Option B and let the ledger skip anything already applied.
--
-- USAGE
--   psql -h <host> -U postgres -d riskradar -v ON_ERROR_STOP=1 \
--        -f supabase/migrations-onprem/riskradar-onprem-delta-2026-07-26.sql
--   psql -f supabase/migrations-onprem/999_verify_install.sql
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public._onprem_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

\echo '=== RiskRadar delta 2026-07-26: 20 migrations ==='

-- =====================================================================
-- Migration: 20260708211953_bb30bd38-784b-4ede-a035-3a0e2f1f8bf7.sql
-- =====================================================================
\echo '--> 20260708211953_bb30bd38-784b-4ede-a035-3a0e2f1f8bf7.sql'

-- Only ADMINs can read from the onprem-exports bucket
DROP POLICY IF EXISTS "onprem_exports_admin_read" ON storage.objects;
CREATE POLICY "onprem_exports_admin_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

-- Only ADMINs can delete (post-import cleanup)
DROP POLICY IF EXISTS "onprem_exports_admin_delete" ON storage.objects;
CREATE POLICY "onprem_exports_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260708211953_bb30bd38-784b-4ede-a035-3a0e2f1f8bf7.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724103543_1d149ae9-e00e-4918-947b-a93d9635601d.sql
-- =====================================================================
\echo '--> 20260724103543_1d149ae9-e00e-4918-947b-a93d9635601d.sql'
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'whistleblow_attachments',
    'risk_category_audit_logs',
    'assessment_templates',
    'template_sections',
    'template_questions',
    'template_category_links',
    'bcp_schema_check_logs',
    'bcp_version_history',
    'auth_failed_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724103543_1d149ae9-e00e-4918-947b-a93d9635601d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724103611_278233f4-bdcf-469b-be92-6dc834e214d0.sql
-- =====================================================================
\echo '--> 20260724103611_278233f4-bdcf-469b-be92-6dc834e214d0.sql'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_category_audit_logs TO authenticated;
GRANT ALL ON public.risk_category_audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_templates TO authenticated;
GRANT ALL ON public.assessment_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_sections TO authenticated;
GRANT ALL ON public.template_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_questions TO authenticated;
GRANT ALL ON public.template_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_category_links TO authenticated;
GRANT ALL ON public.template_category_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_schema_check_logs TO authenticated;
GRANT ALL ON public.bcp_schema_check_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_version_history TO authenticated;
GRANT ALL ON public.bcp_version_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_failed_attempts TO authenticated;
GRANT ALL ON public.auth_failed_attempts TO service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724103611_278233f4-bdcf-469b-be92-6dc834e214d0.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724105920_93eeb6b4-0b62-48ea-b174-6c2696cb76f2.sql
-- =====================================================================
\echo '--> 20260724105920_93eeb6b4-0b62-48ea-b174-6c2696cb76f2.sql'

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

-- 6. Function search_path hardening (16 flagged functions).
--    Wrapped so a missing/differently-signed function on the on-prem baseline
--    doesn't abort the whole delta transaction.
DO $$
DECLARE
  sigs text[] := ARRAY[
    'public.create_bcp_audit_log()',
    'public.create_risk_audit_log()',
    'public.get_backup_status_summary()',
    'public.get_user_role(uuid)',
    'public.increment_discussion_views()',
    'public.log_system_audit(uuid, text, text, text, uuid, jsonb, text)',
    'public.log_user_activity(uuid, text, text, uuid, jsonb)',
    'public.notify_bcp_change()',
    'public.notify_document_upload()',
    'public.notify_risk_update()',
    'public.schedule_backup_operation(uuid, text, uuid)',
    'public.send_notification(uuid, text, text, text, text, text, uuid, jsonb)',
    'public.update_discussion_stats()',
    'public.update_updated_at_column()',
    'public.user_has_role(uuid, user_role)',
    'public.get_user_roles(uuid)'
  ];
  s text;
BEGIN
  FOREACH s IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', s);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'Skipping ALTER FUNCTION %s (not present on this database)', s;
    END;
  END LOOP;
END $$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260724105920_93eeb6b4-0b62-48ea-b174-6c2696cb76f2.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724110950_b2a4fcc7-73d1-4671-b1fd-8d5738e7e2e9.sql
-- =====================================================================
\echo '--> 20260724110950_b2a4fcc7-73d1-4671-b1fd-8d5738e7e2e9.sql'

-- 1. Storage: control-documents ownership/department check
DROP POLICY IF EXISTS "Authenticated can read control documents" ON storage.objects;

DROP POLICY IF EXISTS "Read control documents by role/owner/department" ON storage.objects;
CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = storage.objects.name
        AND (cd.owner_id = auth.uid() OR cd.department = p.department)
    )
  )
);

-- 2. notification_preferences: replace ALL policy with per-command policies that enforce ownership on writes
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.notification_preferences;

CREATE POLICY "np_select_own" ON public.notification_preferences
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "np_insert_own" ON public.notification_preferences
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_update_own" ON public.notification_preferences
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_delete_own" ON public.notification_preferences
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. profiles UPDATE: add WITH CHECK (role change still blocked by prevent_profile_role_self_escalation_trg)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. forum_votes: replace ALL policy with per-command ownership-enforced policies
DROP POLICY IF EXISTS "Users can manage their own votes" ON public.forum_votes;

CREATE POLICY "fv_select_own" ON public.forum_votes
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "fv_insert_own" ON public.forum_votes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_update_own" ON public.forum_votes
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_delete_own" ON public.forum_votes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. recovery_checklists: admin ALL policy needs matching WITH CHECK
DROP POLICY IF EXISTS "Admins can manage recovery checklists" ON public.recovery_checklists;

CREATE POLICY "Admins can manage recovery checklists"
ON public.recovery_checklists FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260724110950_b2a4fcc7-73d1-4671-b1fd-8d5738e7e2e9.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724112447_c90784d3-84a1-48a3-943e-5e56578ce0e6.sql
-- =====================================================================
\echo '--> 20260724112447_c90784d3-84a1-48a3-943e-5e56578ce0e6.sql'
-- Replace permissive WITH CHECK (true) insert policies with WITH CHECK (false).
-- Rows are written by SECURITY DEFINER triggers/functions (owner bypasses RLS)
-- and by edge functions using the service_role key (bypasses RLS).
-- No legitimate direct client insert path exists for these tables.

DROP POLICY IF EXISTS "System insert task history" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history inserts"
  ON public.risk_mitigation_task_history
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System inserts risk category audit logs" ON public.risk_category_audit_logs;
CREATE POLICY "Block direct risk category audit inserts"
  ON public.risk_category_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System insert AI predictions" ON public.ai_predictions;
CREATE POLICY "Block direct AI prediction inserts"
  ON public.ai_predictions
  FOR INSERT TO authenticated
  WITH CHECK (false);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724112447_c90784d3-84a1-48a3-943e-5e56578ce0e6.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724113241_b5638056-a6bd-43af-863c-f6d2199b9b57.sql
-- =====================================================================
\echo '--> 20260724113241_b5638056-a6bd-43af-863c-f6d2199b9b57.sql'
-- 1) Profiles: split-column check on UPDATE so self-service updates cannot change role/department/is_locked
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
  AND department IS NOT DISTINCT FROM (SELECT p.department FROM public.profiles p WHERE p.user_id = auth.uid())
  AND is_locked IS NOT DISTINCT FROM (SELECT p.is_locked FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 2) risk_audit_logs: consolidate the three overlapping SELECT policies into two clear, non-overlapping ones
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "RMD/CRO/ADMIN can view all risk audit logs" ON public.risk_audit_logs;
DROP POLICY IF EXISTS "Users can view audit logs for accessible risks" ON public.risk_audit_logs;

CREATE POLICY "Privileged roles view all risk audit logs"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD','CRO','ADMIN','SUPERVISOR','EC','ERMSC','RCB']::user_role[])
  )
);

CREATE POLICY "Users view audit logs for accessible risks"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724113241_b5638056-a6bd-43af-863c-f6d2199b9b57.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724115549_08538f75-32b6-494d-a91e-f7e76a164676.sql
-- =====================================================================
\echo '--> 20260724115549_08538f75-32b6-494d-a91e-f7e76a164676.sql'
-- =====================================================================
-- Automatic account lockout after N failed logins within a time window.
-- Threshold: 5 failed attempts in 15 minutes -> lock the profile.
-- =====================================================================

-- 1. Record a failed login and auto-lock if threshold exceeded
CREATE OR REPLACE FUNCTION public.record_failed_login(
  _email text,
  _ip    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := now() - interval '15 minutes';
  v_threshold    int := 5;
  v_attempts     int;
  v_target_user  uuid;
  v_already_locked boolean;
  v_locked_now   boolean := false;
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN jsonb_build_object('locked', false, 'attempts', 0);
  END IF;

  -- Log the attempt
  INSERT INTO public.auth_failed_attempts(email, ip_address)
  VALUES (lower(trim(_email)), _ip);

  -- Count recent attempts for this email
  SELECT count(*) INTO v_attempts
  FROM public.auth_failed_attempts
  WHERE email = lower(trim(_email))
    AND attempted_at >= v_window_start;

  -- Look up profile (may not exist if email is bogus)
  SELECT user_id, is_locked
    INTO v_target_user, v_already_locked
  FROM public.profiles
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;

  IF v_attempts >= v_threshold
     AND v_target_user IS NOT NULL
     AND COALESCE(v_already_locked, false) = false THEN

    UPDATE public.profiles
    SET is_locked     = true,
        locked_at     = now(),
        locked_reason = format(
          'Auto-locked after %s failed sign-in attempts within 15 minutes',
          v_attempts
        )
    WHERE user_id = v_target_user;

    v_locked_now := true;

    PERFORM public.log_system_audit(
      v_target_user,
      'account_auto_locked',
      'authentication',
      'profile',
      v_target_user,
      jsonb_build_object(
        'email', lower(trim(_email)),
        'ip_address', _ip,
        'failed_attempts', v_attempts,
        'window_minutes', 15
      ),
      'high'
    );
  END IF;

  RETURN jsonb_build_object(
    'locked',   COALESCE(v_already_locked, false) OR v_locked_now,
    'attempts', v_attempts,
    'threshold', v_threshold
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_failed_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text) TO anon, authenticated, service_role;

-- 2. Cheap lookup used by the sign-in screen before submitting credentials
CREATE OR REPLACE FUNCTION public.is_account_locked(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_locked FROM public.profiles
      WHERE lower(email) = lower(trim(_email)) LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_locked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon, authenticated, service_role;

-- 3. Clear the failure ledger on successful sign-in so counters reset
CREATE OR REPLACE FUNCTION public.clear_failed_login_attempts(_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_failed_attempts
  WHERE email = lower(trim(_email));
$$;

REVOKE ALL ON FUNCTION public.clear_failed_login_attempts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_failed_login_attempts(text) TO anon, authenticated, service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724115549_08538f75-32b6-494d-a91e-f7e76a164676.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724121648_3b852db1-ffac-46c3-aec5-d1796460114d.sql
-- =====================================================================
\echo '--> 20260724121648_3b852db1-ffac-46c3-aec5-d1796460114d.sql'
-- 1) Attempt ledger
CREATE TABLE public.whistleblow_submission_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT,
  fingerprint TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_wb_attempts_ip_time ON public.whistleblow_submission_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_wb_attempts_fp_time ON public.whistleblow_submission_attempts (fingerprint, attempted_at DESC);

-- Service role only (edge function writes; no client access)
GRANT ALL ON public.whistleblow_submission_attempts TO service_role;

ALTER TABLE public.whistleblow_submission_attempts ENABLE ROW LEVEL SECURITY;

-- Deny all client access explicitly; service role bypasses RLS
CREATE POLICY "wb_attempts_no_client_access"
  ON public.whistleblow_submission_attempts
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2) Rate-limit checker (SECURITY DEFINER, callable only by service role)
CREATE OR REPLACE FUNCTION public.check_whistleblow_rate_limit(
  _ip TEXT,
  _fingerprint TEXT,
  _window_minutes INT DEFAULT 10,
  _max_per_ip INT DEFAULT 3,
  _max_per_fingerprint INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - make_interval(mins => _window_minutes);
  v_ip_count INT := 0;
  v_fp_count INT := 0;
BEGIN
  IF _ip IS NOT NULL AND length(trim(_ip)) > 0 THEN
    SELECT count(*) INTO v_ip_count
    FROM public.whistleblow_submission_attempts
    WHERE ip_address = _ip AND attempted_at >= v_window_start;
  END IF;

  IF _fingerprint IS NOT NULL AND length(trim(_fingerprint)) > 0 THEN
    SELECT count(*) INTO v_fp_count
    FROM public.whistleblow_submission_attempts
    WHERE fingerprint = _fingerprint AND attempted_at >= v_window_start;
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_ip_count < _max_per_ip AND v_fp_count < _max_per_fingerprint),
    'ip_count', v_ip_count,
    'fp_count', v_fp_count,
    'max_per_ip', _max_per_ip,
    'max_per_fingerprint', _max_per_fingerprint,
    'window_minutes', _window_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) TO service_role;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724121648_3b852db1-ffac-46c3-aec5-d1796460114d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260724180259_4773ed8d-5e51-456e-ab45-bdcfd0a5d91d.sql
-- =====================================================================
\echo '--> 20260724180259_4773ed8d-5e51-456e-ab45-bdcfd0a5d91d.sql'
-- 1) Re-grant table access on core tables (grants got wiped, causing "permission denied")
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT ALL ON public.risks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_continuity_plans TO authenticated;
GRANT ALL ON public.business_continuity_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT ALL ON public.board_report_archives TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

-- 2) ai_predictions: add columns the app uses
ALTER TABLE public.ai_predictions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_predictions_status ON public.ai_predictions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_predictions TO authenticated;
GRANT ALL ON public.ai_predictions TO service_role;

-- 3) whistleblow_cases: add columns expected by app and edge functions
ALTER TABLE public.whistleblow_cases
  ADD COLUMN IF NOT EXISTS case_reference text,
  ADD COLUMN IF NOT EXISTS reporter_passphrase_hash text,
  ADD COLUMN IF NOT EXISTS date_of_incident date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS individuals_involved text,
  ADD COLUMN IF NOT EXISTS evidence_description text;

-- Backfill case_reference from existing case_number where possible (only if legacy column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='whistleblow_cases' AND column_name='case_number'
  ) THEN
    EXECUTE 'UPDATE public.whistleblow_cases SET case_reference = case_number WHERE case_reference IS NULL AND case_number IS NOT NULL';
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS whistleblow_cases_case_reference_key
  ON public.whistleblow_cases(case_reference)
  WHERE case_reference IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_cases TO authenticated;
GRANT ALL ON public.whistleblow_cases TO service_role;

-- 4) whistleblow_attachments: create if missing
CREATE TABLE IF NOT EXISTS public.whistleblow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  uploaded_by_type text NOT NULL DEFAULT 'reporter',
  uploaded_by uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.whistleblow_attachments TO authenticated;
GRANT ALL ON public.whistleblow_attachments TO service_role;

ALTER TABLE public.whistleblow_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can view attachments'
  ) THEN
    CREATE POLICY "Investigators can view attachments"
      ON public.whistleblow_attachments FOR SELECT TO authenticated
      USING (public.user_has_role(auth.uid(), 'RMD'::user_role)
          OR public.user_has_role(auth.uid(), 'CRO'::user_role)
          OR public.user_has_role(auth.uid(), 'ADMIN'::user_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can insert attachments'
  ) THEN
    CREATE POLICY "Investigators can insert attachments"
      ON public.whistleblow_attachments FOR INSERT TO authenticated
      WITH CHECK ((public.user_has_role(auth.uid(), 'RMD'::user_role)
                OR public.user_has_role(auth.uid(), 'CRO'::user_role)
                OR public.user_has_role(auth.uid(), 'ADMIN'::user_role))
               AND uploaded_by_type = 'investigator'
               AND uploaded_by = auth.uid());
  END IF;
END$$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260724180259_4773ed8d-5e51-456e-ab45-bdcfd0a5d91d.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260725094949_523a3872-fa3d-4763-b543-9c84acd6972f.sql
-- =====================================================================
\echo '--> 20260725094949_523a3872-fa3d-4763-b543-9c84acd6972f.sql'

-- 1) auth_failed_attempts: scope SELECT policy to authenticated
DROP POLICY IF EXISTS "Admins can read failed attempts" ON public.auth_failed_attempts;
CREATE POLICY "Admins can read failed attempts"
  ON public.auth_failed_attempts
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role));

-- 2) profiles: scope self-select to authenticated, add explicit INSERT block for clients
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Block client profile inserts" ON public.profiles;
CREATE POLICY "Block client profile inserts"
  ON public.profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- 3) risk_mitigation_task_history: add explicit UPDATE/DELETE blocking policies
DROP POLICY IF EXISTS "Block direct task history updates" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history updates"
  ON public.risk_mitigation_task_history
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct task history deletes" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history deletes"
  ON public.risk_mitigation_task_history
  FOR DELETE
  TO authenticated
  USING (false);

-- 4) Storage: rescope bcp-documents policies to authenticated
DROP POLICY IF EXISTS "RMD can delete BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "RMD can update BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "RMD can upload BCP documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view BCP documents they have access to" ON storage.objects;

CREATE POLICY "RMD can upload BCP documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "RMD can update BCP documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "RMD can delete BCP documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::user_role[]))
  );

CREATE POLICY "Users can view BCP documents they have access to"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bcp-documents'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- 5) Restrict avatars bucket SELECT (public bucket allows listing warning)
-- Replace broad public SELECT with per-object read that requires knowing the path.
-- Avatars remain accessible via signed URLs / direct paths; only listing is blocked.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
-- Keep public read of individual objects by allowing SELECT scoped to bucket only,
-- but revoke list on bucket via not exposing prefix wildcard patterns.
-- Since Supabase SELECT policy governs list too, restrict to authenticated only.
CREATE POLICY "Authenticated users can read avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- 6) SECURITY DEFINER function EXECUTE grants: revoke PUBLIC/anon and grant to authenticated
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true AND n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant anon access for login-flow and public whistleblow functions
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_failed_login_attempts(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_whistleblow_rate_limit(text, text, integer, integer, integer) TO anon;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260725094949_523a3872-fa3d-4763-b543-9c84acd6972f.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260725095623_8f3d9c29-0e83-4e37-b9fb-c6f7078a7841.sql
-- =====================================================================
\echo '--> 20260725095623_8f3d9c29-0e83-4e37-b9fb-c6f7078a7841.sql'

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
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipping REVOKE on public.%() — not present', fn;
    END;
  END LOOP;
END $$;

-- Also revoke from anon on internal helpers not intended for direct anon calls.
-- Wrapped in a DO block so a missing/differently-signed function on the on-prem
-- baseline doesn't abort the transaction.
DO $$
DECLARE
  sigs text[] := ARRAY[
    'public.log_system_audit(uuid, text, text, text, uuid, jsonb, text)',
    'public.log_user_activity(uuid, text, text, uuid, jsonb)',
    'public.send_notification(uuid, text, text, text, text, text, uuid, jsonb)',
    'public.schedule_backup_operation(uuid, text, uuid)',
    'public.admin_set_user_locked(uuid, boolean, text)',
    'public.get_admin_auth_overview()',
    'public.get_backup_status_summary()',
    'public.get_approval_inbox()',
    'public.apply_workflow_transition(uuid, text, text)',
    'public.log_approval_action(uuid, text, approval_status, text, jsonb)',
    'public.log_password_change_event()',
    'public.can_access_risk(uuid)',
    'public.is_template_manager()',
    'public.risk_category_usage(uuid)',
    'public.get_user_role(uuid)',
    'public.resolve_risk_appetite(risk_type, risk_category, text)',
    'public.generate_reference_number(text)'
  ];
  s text;
BEGIN
  FOREACH s IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', s);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipping REVOKE on % — not present', s;
    END;
  END LOOP;
END $$;

INSERT INTO public._onprem_migrations(filename) VALUES ('20260725095623_8f3d9c29-0e83-4e37-b9fb-c6f7078a7841.sql') ON CONFLICT DO NOTHING;


-- =====================================================================
-- Migration: 20260725101728_ffea2794-1ad3-48bb-9417-7b0675ddc4c8.sql
-- =====================================================================
\echo '--> 20260725101728_ffea2794-1ad3-48bb-9417-7b0675ddc4c8.sql'
DROP POLICY IF EXISTS "Authenticated users can read avatars" ON storage.objects;

CREATE POLICY "Users can read their own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
INSERT INTO public._onprem_migrations(filename) VALUES ('20260725101728_ffea2794-1ad3-48bb-9417-7b0675ddc4c8.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726052511_b7d8a122-7bed-4ff8-b4c4-7f6707d9b24a.sql
-- =====================================================================
\echo '--> 20260726052511_b7d8a122-7bed-4ff8-b4c4-7f6707d9b24a.sql'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whistleblow_cases'
      AND column_name = 'case_number'
  ) THEN
    EXECUTE 'ALTER TABLE public.whistleblow_cases ALTER COLUMN case_number DROP NOT NULL';
    EXECUTE 'UPDATE public.whistleblow_cases SET case_number = case_reference WHERE case_number IS NULL AND case_reference IS NOT NULL';
  END IF;
END $$;
INSERT INTO public._onprem_migrations(filename) VALUES ('20260726052511_b7d8a122-7bed-4ff8-b4c4-7f6707d9b24a.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726054841_be7a6738-2bd1-4ebe-af88-ff192ccb3c1c.sql
-- =====================================================================
\echo '--> 20260726054841_be7a6738-2bd1-4ebe-af88-ff192ccb3c1c.sql'

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

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726054841_be7a6738-2bd1-4ebe-af88-ff192ccb3c1c.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726060801_3605db91-2b77-4287-b487-cecab97e00a3.sql
-- =====================================================================
\echo '--> 20260726060801_3605db91-2b77-4287-b487-cecab97e00a3.sql'

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

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726060801_3605db91-2b77-4287-b487-cecab97e00a3.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063100_f63ef505-9c42-49bf-a975-26c908760129.sql
-- =====================================================================
\echo '--> 20260726063100_f63ef505-9c42-49bf-a975-26c908760129.sql'
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
INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063100_f63ef505-9c42-49bf-a975-26c908760129.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063513_d98f65cd-9125-47a8-9496-ea396d7b8f8f.sql
-- =====================================================================
\echo '--> 20260726063513_d98f65cd-9125-47a8-9496-ea396d7b8f8f.sql'

-- 1) Avatars: restrict write policies to authenticated role
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2) Control documents: ensure department comparison excludes NULLs
DROP POLICY IF EXISTS "Read control documents by role/owner/department" ON storage.objects;

CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1
      FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = objects.name
        AND (
          cd.owner_id = auth.uid()
          OR (
            cd.department IS NOT NULL
            AND p.department IS NOT NULL
            AND cd.department = p.department
          )
        )
    )
  )
);

-- 3) user_roles: allow signed-in users to view their own role rows
DROP POLICY IF EXISTS "Users can view their own role assignments" ON public.user_roles;
CREATE POLICY "Users can view their own role assignments"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063513_d98f65cd-9125-47a8-9496-ea396d7b8f8f.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726063914_f41fc443-d4d8-42de-a5a2-67a32c26c7bb.sql
-- =====================================================================
\echo '--> 20260726063914_f41fc443-d4d8-42de-a5a2-67a32c26c7bb.sql'

-- 1) Ensure follow_up_token column exists, backfill nulls, and set default
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whistleblow_cases'
      AND column_name = 'follow_up_token'
  ) THEN
    EXECUTE 'ALTER TABLE public.whistleblow_cases ADD COLUMN follow_up_token text';
  END IF;

  EXECUTE $sql$
    UPDATE public.whistleblow_cases
       SET follow_up_token = encode(gen_random_bytes(32), 'hex')
     WHERE follow_up_token IS NULL OR follow_up_token = ''
  $sql$;

  EXECUTE 'ALTER TABLE public.whistleblow_cases ALTER COLUMN follow_up_token SET DEFAULT encode(gen_random_bytes(32), ''hex'')';
END
$mig$;


-- 2) Storage policies for whistleblow-evidence bucket
-- Reads restricted to RMD/CRO/ADMIN via user_has_role.
CREATE POLICY "Investigators can read whistleblow evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whistleblow-evidence' AND (
    public.user_has_role(auth.uid(), 'RMD'::user_role)
    OR public.user_has_role(auth.uid(), 'CRO'::user_role)
    OR public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  )
);

-- Anonymous / client writes are blocked; the whistleblow-submit edge function
-- uses the service role and bypasses these policies.

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726063914_f41fc443-d4d8-42de-a5a2-67a32c26c7bb.sql') ON CONFLICT DO NOTHING;

-- =====================================================================
-- Migration: 20260726064334_7eeffcd1-4bb8-4f3a-8cdb-25be2169b94a.sql
-- =====================================================================
\echo '--> 20260726064334_7eeffcd1-4bb8-4f3a-8cdb-25be2169b94a.sql'

-- 1) user_roles: add explicit WITH CHECK on admin ALL policy for clarity
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
);

-- 2) whistleblow_attachments: allow ADMIN/CRO/RMD to update and delete attachments
CREATE POLICY "Admins can update attachments"
ON public.whistleblow_attachments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);

CREATE POLICY "Admins can delete attachments"
ON public.whistleblow_attachments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);

INSERT INTO public._onprem_migrations(filename) VALUES ('20260726064334_7eeffcd1-4bb8-4f3a-8cdb-25be2169b94a.sql') ON CONFLICT DO NOTHING;

COMMIT;

\echo '=== Delta applied. Now run: psql -f supabase/migrations-onprem/999_verify_install.sql ==='
