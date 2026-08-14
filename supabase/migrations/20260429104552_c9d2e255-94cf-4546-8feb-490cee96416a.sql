-- Audit log for risk_categories changes (incl. blocked deletes)
CREATE TABLE IF NOT EXISTS public.risk_category_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  category_name text,
  risk_type public.risk_type,
  action text NOT NULL, -- created | updated | deleted | delete_blocked
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  changes jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.risk_category_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view risk category audit logs"
ON public.risk_category_audit_logs
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "System inserts risk category audit logs"
ON public.risk_category_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger function: log insert/update/delete
CREATE OR REPLACE FUNCTION public.log_risk_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (NEW.id, NEW.name, NEW.risk_type, 'created', auth.uid(),
      jsonb_build_object('after', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (NEW.id, NEW.name, NEW.risk_type, 'updated', auth.uid(),
      jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.risk_category_audit_logs (category_id, category_name, risk_type, action, performed_by, changes)
    VALUES (OLD.id, OLD.name, OLD.risk_type, 'deleted', auth.uid(),
      jsonb_build_object('before', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_risk_category_change ON public.risk_categories;
CREATE TRIGGER trg_log_risk_category_change
AFTER INSERT OR UPDATE OR DELETE ON public.risk_categories
FOR EACH ROW EXECUTE FUNCTION public.log_risk_category_change();

-- Update the delete-prevention trigger to also log blocked attempts
CREATE OR REPLACE FUNCTION public.prevent_risk_category_delete_if_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = OLD.name
    AND r.risk_type = OLD.risk_type;

  IF v_count > 0 THEN
    INSERT INTO public.risk_category_audit_logs
      (category_id, category_name, risk_type, action, performed_by, reason, changes)
    VALUES
      (OLD.id, OLD.name, OLD.risk_type, 'delete_blocked', auth.uid(),
       format('Referenced by %s existing risk(s)', v_count),
       jsonb_build_object('reference_count', v_count));

    RAISE EXCEPTION
      'Cannot delete risk category "%" — it is referenced by % existing risk(s). Disable it instead.',
      OLD.name, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

-- Usage precheck RPC
CREATE OR REPLACE FUNCTION public.risk_category_usage(p_category_id uuid)
RETURNS TABLE(
  category_id uuid,
  category_name text,
  risk_type public.risk_type,
  reference_count integer,
  is_in_use boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat record;
  v_count integer;
BEGIN
  SELECT id, name, risk_type INTO v_cat
  FROM public.risk_categories WHERE id = p_category_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = v_cat.name
    AND r.risk_type = v_cat.risk_type;

  RETURN QUERY SELECT v_cat.id, v_cat.name, v_cat.risk_type, v_count, v_count > 0;
END;
$$;