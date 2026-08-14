-- Expand SELECT visibility on risks for executive / oversight roles
DROP POLICY IF EXISTS "Authorized users can view risks" ON public.risks;
CREATE POLICY "Authorized users can view risks"
ON public.risks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
        'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
        'ERMSC'::user_role, 'RCB'::user_role, 'SUPERVISOR'::user_role,
        'ADMIN'::user_role
      ])
  )
);

-- Expand SELECT on risk_audit_logs for the same roles
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.risk_audit_logs;
CREATE POLICY "Authorized users can view audit logs"
ON public.risk_audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
        'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
        'ERMSC'::user_role, 'RCB'::user_role, 'SUPERVISOR'::user_role,
        'ADMIN'::user_role
      ])
  )
);
