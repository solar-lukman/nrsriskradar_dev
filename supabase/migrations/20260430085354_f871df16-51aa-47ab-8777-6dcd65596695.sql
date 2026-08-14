-- Extend read access on risk-related tables to executive viewer roles
-- so dashboard widgets show consistent values across CRO, EC, ERMSC, and RCB.

-- 1. risk_assessments
DROP POLICY IF EXISTS "Authorized view assessments" ON public.risk_assessments;
CREATE POLICY "Authorized view assessments"
ON public.risk_assessments
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 2. risk_controls
DROP POLICY IF EXISTS "Authorized view controls" ON public.risk_controls;
CREATE POLICY "Authorized view controls"
ON public.risk_controls
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 3. approval_history
DROP POLICY IF EXISTS "Authorized view approval history" ON public.approval_history;
CREATE POLICY "Authorized view approval history"
ON public.approval_history
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 4. risk_mitigation_tasks
DROP POLICY IF EXISTS "Authorized view mitigation tasks" ON public.risk_mitigation_tasks;
CREATE POLICY "Authorized view mitigation tasks"
ON public.risk_mitigation_tasks
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'SUPERVISOR'::user_role,
      'ADMIN'::user_role, 'EC'::user_role, 'ERMSC'::user_role, 'RCB'::user_role
    ])
));

-- 5. ai_predictions (add RCB)
DROP POLICY IF EXISTS "Authorized view AI predictions" ON public.ai_predictions;
CREATE POLICY "Authorized view AI predictions"
ON public.ai_predictions
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY[
      'RC'::user_role, 'RR'::user_role, 'RO'::user_role,
      'RMD'::user_role, 'CRO'::user_role, 'EC'::user_role,
      'ERMSC'::user_role, 'RCB'::user_role, 'ADMIN'::user_role,
      'SUPERVISOR'::user_role
    ])
));