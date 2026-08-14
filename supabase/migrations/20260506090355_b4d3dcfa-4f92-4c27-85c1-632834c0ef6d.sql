
-- 1. Add lockout flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text;

-- 2. Failed-attempts ledger (written by app/edge function on failed login)
CREATE TABLE IF NOT EXISTS public.auth_failed_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_failed_attempts_email_time
  ON public.auth_failed_attempts (email, attempted_at DESC);

ALTER TABLE public.auth_failed_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can read; inserts go through service role / edge function
CREATE POLICY "Admins can read failed attempts"
  ON public.auth_failed_attempts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ));

-- 3. Admin RPC to lock/unlock a user
CREATE OR REPLACE FUNCTION public.admin_set_user_locked(
  _user_id uuid,
  _locked boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can lock or unlock accounts'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET is_locked = _locked,
      locked_at = CASE WHEN _locked THEN now() ELSE NULL END,
      locked_reason = CASE WHEN _locked THEN _reason ELSE NULL END
  WHERE user_id = _user_id;

  PERFORM public.log_system_audit(
    auth.uid(),
    CASE WHEN _locked THEN 'account_locked' ELSE 'account_unlocked' END,
    'authentication',
    'profile',
    _user_id,
    jsonb_build_object('reason', _reason),
    'high'
  );
END;
$$;

-- 4. Admin overview view
CREATE OR REPLACE VIEW public.admin_auth_overview
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.email,
  p.full_name,
  p.department,
  p.role,
  p.is_locked,
  p.locked_at,
  p.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  COALESCE(
    (SELECT array_agg(ur.role::text ORDER BY ur.assigned_at)
     FROM public.user_roles ur WHERE ur.user_id = p.user_id),
    ARRAY[]::text[]
  ) AS assigned_roles
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id;

-- Restrict view: only admins can SELECT
REVOKE ALL ON public.admin_auth_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_auth_overview TO authenticated;

-- Wrap with a security-definer function that enforces ADMIN
CREATE OR REPLACE FUNCTION public.get_admin_auth_overview()
RETURNS SETOF public.admin_auth_overview
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::user_role
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_auth_overview;
END;
$$;
