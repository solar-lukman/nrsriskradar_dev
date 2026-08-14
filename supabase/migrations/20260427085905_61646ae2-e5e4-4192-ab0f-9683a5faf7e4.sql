-- 1. Create risk_mitigation_tasks table
CREATE TABLE IF NOT EXISTS public.risk_mitigation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  evidence_notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_mitigation_tasks_risk_id ON public.risk_mitigation_tasks(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_mitigation_tasks_assigned_to ON public.risk_mitigation_tasks(assigned_to);

ALTER TABLE public.risk_mitigation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized view mitigation tasks"
  ON public.risk_mitigation_tasks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

CREATE POLICY "Authorized manage mitigation tasks"
  ON public.risk_mitigation_tasks FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

CREATE TRIGGER update_risk_mitigation_tasks_updated_at
  BEFORE UPDATE ON public.risk_mitigation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Update risk_assessments policy to include RR (Risk Reviewer)
DROP POLICY IF EXISTS "Authorized manage assessments" ON public.risk_assessments;
CREATE POLICY "Authorized manage assessments"
  ON public.risk_assessments FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));

-- 3. Update risk_controls policy to include RR (Risk Reviewer)
DROP POLICY IF EXISTS "Authorized manage controls" ON public.risk_controls;
CREATE POLICY "Authorized manage controls"
  ON public.risk_controls FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = ANY (ARRAY['RC','RR','RO','RMD','CRO','SUPERVISOR','ADMIN']::user_role[])
  ));