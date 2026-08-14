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