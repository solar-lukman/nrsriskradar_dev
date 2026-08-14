-- Create risk categories enum
CREATE TYPE public.risk_category AS ENUM (
  'Strategic',
  'Operational', 
  'Financial',
  'Compliance',
  'Technology',
  'Reputational',
  'Environmental',
  'Human Resources'
);

-- Create risk status enum
CREATE TYPE public.risk_status AS ENUM (
  'New',
  'In Review',
  'Mitigated', 
  'Escalated'
);

-- Create risks table
CREATE TABLE public.risks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category risk_category NOT NULL,
  department TEXT,
  owner_id UUID REFERENCES public.profiles(user_id),
  assigned_to_id UUID REFERENCES public.profiles(user_id),
  inherent_likelihood INTEGER NOT NULL CHECK (inherent_likelihood >= 1 AND inherent_likelihood <= 5),
  inherent_impact INTEGER NOT NULL CHECK (inherent_impact >= 1 AND inherent_impact <= 5),
  residual_likelihood INTEGER NOT NULL CHECK (residual_likelihood >= 1 AND residual_likelihood <= 5),
  residual_impact INTEGER NOT NULL CHECK (residual_impact >= 1 AND residual_impact <= 5),
  status risk_status NOT NULL DEFAULT 'New',
  mitigation_plan TEXT,
  mitigation_actions JSONB DEFAULT '[]',
  target_date DATE,
  review_date DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit logs table
CREATE TABLE public.risk_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted'
  changes JSONB, -- stores before/after values
  performed_by UUID NOT NULL REFERENCES public.profiles(user_id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for risks table
-- RC, RR, RO, and RMD can view risks
CREATE POLICY "Authorized users can view risks" 
ON public.risks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RR', 'RO', 'RMD', 'ADMIN')
  )
);

-- RC, RO, and RMD can create risks
CREATE POLICY "Authorized users can create risks" 
ON public.risks 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RO', 'RMD', 'ADMIN')
  )
);

-- RC, RO, and RMD can update risks they created or own
CREATE POLICY "Authorized users can update risks" 
ON public.risks 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RO', 'RMD', 'ADMIN')
  ) AND (
    created_by = auth.uid() OR 
    owner_id = auth.uid() OR
    assigned_to_id = auth.uid()
  )
);

-- Only RMD and ADMIN can delete risks
CREATE POLICY "RMD and ADMIN can delete risks" 
ON public.risks 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RMD', 'ADMIN')
  )
);

-- RLS Policies for audit logs
CREATE POLICY "Authorized users can view audit logs" 
ON public.risk_audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('RC', 'RR', 'RO', 'RMD', 'ADMIN')
  )
);

CREATE POLICY "System can insert audit logs" 
ON public.risk_audit_logs 
FOR INSERT 
WITH CHECK (true);

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION public.create_risk_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (NEW.id, 'updated', jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    ), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for audit logging
CREATE TRIGGER risk_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.create_risk_audit_log();

-- Create trigger for updating updated_at
CREATE TRIGGER update_risks_updated_at
  BEFORE UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_risks_status ON public.risks(status);
CREATE INDEX idx_risks_category ON public.risks(category);
CREATE INDEX idx_risks_owner_id ON public.risks(owner_id);
CREATE INDEX idx_risks_created_by ON public.risks(created_by);
CREATE INDEX idx_risks_department ON public.risks(department);
CREATE INDEX idx_audit_logs_risk_id ON public.risk_audit_logs(risk_id);
CREATE INDEX idx_audit_logs_performed_at ON public.risk_audit_logs(performed_at DESC);