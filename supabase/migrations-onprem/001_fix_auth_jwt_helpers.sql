-- =====================================================================
-- RiskRadar — On-Premise JWT/RLS Compatibility Fix
-- =====================================================================
-- Run once as supabase_admin on an existing self-hosted installation.
-- Modern PostgREST stores verified JWT claims in request.jwt.claims.

BEGIN;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  )
$$;

DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

COMMIT;

-- Verification in psql (must return the admin UUID and ADMIN row):
-- SET ROLE authenticated;
-- SELECT set_config(
--   'request.jwt.claims',
--   '{"sub":"734023bf-ab9a-4c92-9d67-4a60a94e88bb","role":"authenticated"}',
--   false
-- );
-- SELECT auth.uid(), auth.role();
-- SELECT user_id, role FROM public.user_roles
-- WHERE user_id = auth.uid();
-- RESET ROLE;