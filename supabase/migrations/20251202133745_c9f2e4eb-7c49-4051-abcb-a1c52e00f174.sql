-- Create ai_predictions table to store AI-generated risk predictions
CREATE TABLE public.ai_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_type TEXT NOT NULL DEFAULT 'emerging_risk',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  data_sources JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'converted')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  converted_risk_id UUID REFERENCES public.risks(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authorized users can view AI predictions"
  ON public.ai_predictions
  FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC'::user_role, 'RR'::user_role, 'RO'::user_role, 'RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "RMD and above can manage AI predictions"
  ON public.ai_predictions
  FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- Create updated_at trigger
CREATE TRIGGER update_ai_predictions_updated_at
  BEFORE UPDATE ON public.ai_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_ai_predictions_status ON public.ai_predictions(status);
CREATE INDEX idx_ai_predictions_category ON public.ai_predictions(category);
CREATE INDEX idx_ai_predictions_expires_at ON public.ai_predictions(expires_at);