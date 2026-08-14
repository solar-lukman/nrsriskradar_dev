-- Prevent non-admins from changing the 'department' field on profiles
CREATE OR REPLACE FUNCTION public.enforce_profile_department_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.department IS DISTINCT FROM NEW.department THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'ADMIN'::public.user_role
    ) INTO v_is_admin;

    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Only administrators can change the department field'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_department_admin_only ON public.profiles;
CREATE TRIGGER trg_enforce_profile_department_admin_only
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_department_admin_only();