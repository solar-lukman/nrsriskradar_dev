-- Broaden SELECT on risk_events: any authenticated user can view incidents
DROP POLICY IF EXISTS "Authorized view risk events" ON public.risk_events;
CREATE POLICY "All authenticated can view risk events"
  ON public.risk_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Broaden manage policy to include CRO/SUPERVISOR/RR who often log/triage incidents
DROP POLICY IF EXISTS "Authorized manage risk events" ON public.risk_events;
CREATE POLICY "Authorized manage risk events"
  ON public.risk_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
    )
  );