
-- Create risk assessments table to track assessment history
CREATE TABLE public.risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessment_type TEXT NOT NULL DEFAULT 'current', -- 'inherent', 'residual', 'target'
  likelihood INTEGER NOT NULL CHECK (likelihood >= 1 AND likelihood <= 5),
  impact INTEGER NOT NULL CHECK (impact >= 1 AND impact <= 5),
  control_score INTEGER DEFAULT 0 CHECK (control_score >= 0 AND control_score <= 100),
  notes TEXT,
  assessor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create controls table for individual risk controls
CREATE TABLE public.risk_controls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  control_name TEXT NOT NULL,
  control_type TEXT NOT NULL DEFAULT 'mitigative', -- 'detective', 'mitigative', 'preventive'
  control_description TEXT,
  effectiveness_rating INTEGER DEFAULT 0 CHECK (effectiveness_rating >= 0 AND effectiveness_rating <= 100),
  last_tested_date DATE,
  next_test_date DATE,
  test_frequency TEXT DEFAULT 'annual', -- 'monthly', 'quarterly', 'annual'
  owner_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'planned'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add control-related fields to existing risks table
ALTER TABLE public.risks 
ADD COLUMN control_effectiveness_score INTEGER DEFAULT 0 CHECK (control_effectiveness_score >= 0 AND control_effectiveness_score <= 100),
ADD COLUMN target_control_score INTEGER DEFAULT 80 CHECK (target_control_score >= 0 AND target_control_score <= 100),
ADD COLUMN next_assessment_date DATE,
ADD COLUMN last_assessment_date DATE;

-- Enable RLS on new tables
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_controls ENABLE ROW LEVEL SECURITY;

-- RLS policies for risk_assessments
CREATE POLICY "Authorized users can view risk assessments"
  ON public.risk_assessments FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can create risk assessments"
  ON public.risk_assessments FOR INSERT
  WITH CHECK (auth.uid() = assessor_id AND user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can update risk assessments"
  ON public.risk_assessments FOR UPDATE
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- RLS policies for risk_controls
CREATE POLICY "Authorized users can view risk controls"
  ON public.risk_controls FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Authorized users can manage risk controls"
  ON public.risk_controls FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RO'::user_role, 'RMD'::user_role, 'ADMIN'::user_role]));

-- Add triggers for updated_at columns
CREATE TRIGGER update_risk_assessments_updated_at
  BEFORE UPDATE ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_controls_updated_at
  BEFORE UPDATE ON public.risk_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_risk_assessments_risk_id ON public.risk_assessments(risk_id);
CREATE INDEX idx_risk_assessments_date ON public.risk_assessments(assessment_date);
CREATE INDEX idx_risk_controls_risk_id ON public.risk_controls(risk_id);
CREATE INDEX idx_risk_controls_test_date ON public.risk_controls(next_test_date);
