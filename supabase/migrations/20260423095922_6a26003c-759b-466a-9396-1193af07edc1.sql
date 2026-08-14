
-- Configurable mapping of treatment strategies → auto-set risk status on submission
CREATE TABLE IF NOT EXISTS public.treatment_strategy_status_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treatment_strategy TEXT NOT NULL UNIQUE,
  target_status public.risk_status NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_strategy_status_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view strategy status map"
ON public.treatment_strategy_status_map
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins manage strategy status map"
ON public.treatment_strategy_status_map
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role));

CREATE TRIGGER update_treatment_strategy_status_map_updated_at
BEFORE UPDATE ON public.treatment_strategy_status_map
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults (only valid risk_status enum values)
INSERT INTO public.treatment_strategy_status_map (treatment_strategy, target_status, description) VALUES
  ('Mitigate', 'In Review', 'Active treatment in progress; awaiting validation'),
  ('Avoid', 'In Review', 'Risk avoidance plan being executed'),
  ('Transfer', 'In Review', 'Risk transferred via insurance/outsourcing; under monitoring'),
  ('Accept', 'New', 'Risk accepted; tracked without active treatment')
ON CONFLICT (treatment_strategy) DO NOTHING;
