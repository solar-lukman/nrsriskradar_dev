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