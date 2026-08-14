-- Add risk_type to RiskData by exposing it (already exists in DB) — no schema change needed for that.

-- 1. Trigger: log profile role changes into system_audit_logs
CREATE OR REPLACE FUNCTION public.log_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'profile_role_changed',
      'authorization',
      'profile',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'target_email', NEW.email,
        'from_role', OLD.role,
        'to_role', NEW.role
      ),
      'high'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_role_change ON public.profiles;
CREATE TRIGGER trg_log_profile_role_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_role_change();

-- 2. Trigger: log user_roles assignment / removal
CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_system_audit(
      COALESCE(auth.uid(), NEW.assigned_by),
      'user_role_assigned',
      'authorization',
      'user_role',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'role', NEW.role
      ),
      'high'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'user_role_revoked',
      'authorization',
      'user_role',
      OLD.id,
      jsonb_build_object(
        'target_user_id', OLD.user_id,
        'role', OLD.role
      ),
      'high'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_role_change ON public.user_roles;
CREATE TRIGGER trg_log_user_role_change
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_role_change();

-- 3. Trigger: log approval-status transitions to system_audit_logs (in addition to approval_history)
CREATE OR REPLACE FUNCTION public.log_approval_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'risk_approval_status_changed',
      'data_modification',
      'risk',
      NEW.id,
      jsonb_build_object(
        'risk_reference', NEW.risk_reference,
        'title', NEW.title,
        'from_status', OLD.approval_status,
        'to_status', NEW.approval_status,
        'comment', NEW.last_review_comment
      ),
      'high'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_approval_status_audit ON public.risks;
CREATE TRIGGER trg_log_approval_status_audit
  AFTER UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_approval_status_audit();

-- 4. Trigger: log BCP status transitions to system_audit_logs
CREATE OR REPLACE FUNCTION public.log_bcp_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_system_audit(
      auth.uid(),
      'bcp_status_changed',
      'data_modification',
      'bcp',
      NEW.id,
      jsonb_build_object(
        'reference_number', NEW.reference_number,
        'title', NEW.title,
        'from_status', OLD.status,
        'to_status', NEW.status
      ),
      'medium'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_bcp_status_audit ON public.business_continuity_plans;
CREATE TRIGGER trg_log_bcp_status_audit
  AFTER UPDATE ON public.business_continuity_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.log_bcp_status_audit();