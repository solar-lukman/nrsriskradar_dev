
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
