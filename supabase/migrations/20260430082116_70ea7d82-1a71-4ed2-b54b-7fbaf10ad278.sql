-- 1) Auto-sync risk_categories.name into the risk_category enum
CREATE OR REPLACE FUNCTION public.sync_risk_category_enum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.name IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'risk_category' AND e.enumlabel = NEW.name
    ) INTO v_exists;

    IF NOT v_exists THEN
      EXECUTE format('ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS %L', NEW.name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_risk_category_enum_trg ON public.risk_categories;
CREATE TRIGGER sync_risk_category_enum_trg
AFTER INSERT OR UPDATE OF name ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.sync_risk_category_enum();

-- 2) RLS: allow RMD/CRO/ADMIN to read all risk_audit_logs (for the new RMD audit view)
ALTER TABLE public.risk_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RMD/CRO/ADMIN can view all risk audit logs" ON public.risk_audit_logs;
CREATE POLICY "RMD/CRO/ADMIN can view all risk audit logs"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD','CRO','ADMIN']::public.user_role[])
  )
);

-- Also let users see audit logs for risks they can already access
DROP POLICY IF EXISTS "Users can view audit logs for accessible risks" ON public.risk_audit_logs;
CREATE POLICY "Users can view audit logs for accessible risks"
ON public.risk_audit_logs
FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));