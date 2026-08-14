-- Allow executive viewer roles (CRO, ERMSC, EC, RCB) and RMD/ADMIN to view all BCPs
-- so the Executive Dashboard's BCP Coverage metric is consistent across roles
-- with view-only access. Department heads keep visibility into their own dept.

DROP POLICY IF EXISTS "RMD and critical dept heads can view all BCPs" ON public.business_continuity_plans;

CREATE POLICY "Executives and dept heads can view BCPs"
ON public.business_continuity_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY[
        'RMD'::user_role,
        'CRO'::user_role,
        'ADMIN'::user_role,
        'ERMSC'::user_role,
        'EC'::user_role,
        'RCB'::user_role
      ])
  )
  OR department = (
    SELECT profiles.department FROM public.profiles
    WHERE profiles.user_id = auth.uid()
  )
);