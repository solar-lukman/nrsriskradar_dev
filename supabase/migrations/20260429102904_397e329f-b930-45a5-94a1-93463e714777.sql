-- Allow ADMIN, RMD, CRO to manage risk_appetite_config based on either profiles.role or user_roles
DROP POLICY IF EXISTS "Risk leaders manage appetite config" ON public.risk_appetite_config;

CREATE POLICY "Risk leaders manage appetite config"
ON public.risk_appetite_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
);