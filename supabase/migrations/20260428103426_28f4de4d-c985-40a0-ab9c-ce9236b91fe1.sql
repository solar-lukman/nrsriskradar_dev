-- Allow RMD and CRO (in addition to ADMIN) to manage risk appetite configuration.
DROP POLICY IF EXISTS "Admins manage appetite config" ON public.risk_appetite_config;

CREATE POLICY "Risk leaders manage appetite config"
ON public.risk_appetite_config
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['ADMIN'::user_role, 'RMD'::user_role, 'CRO'::user_role])
  )
);