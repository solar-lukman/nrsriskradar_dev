-- Create enum for BCP status
CREATE TYPE public.bcp_status AS ENUM ('Ready', 'Needs Review', 'Outdated');

-- Create enum for test status
CREATE TYPE public.test_status AS ENUM ('Not Tested', 'Passed', 'Failed', 'Overdue');

-- Create business continuity plans table
CREATE TABLE public.business_continuity_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  business_function TEXT NOT NULL,
  dependencies TEXT[],
  mitigation_actions JSONB DEFAULT '[]'::jsonb,
  recovery_time_objective INTEGER, -- RTO in hours
  recovery_point_objective INTEGER, -- RPO in hours
  status bcp_status NOT NULL DEFAULT 'Needs Review',
  test_status test_status NOT NULL DEFAULT 'Not Tested',
  last_tested_date DATE,
  next_test_date DATE,
  last_updated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supporting_documents JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_continuity_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for BCP access
CREATE POLICY "RMD and critical dept heads can view all BCPs" 
ON public.business_continuity_plans 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR 
  (department = (SELECT department FROM profiles WHERE user_id = auth.uid()))
);

CREATE POLICY "RMD and dept heads can create BCPs" 
ON public.business_continuity_plans 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD and owners can update BCPs" 
ON public.business_continuity_plans 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR 
  owner_id = auth.uid() 
  OR 
  created_by = auth.uid()
);

CREATE POLICY "RMD can delete BCPs" 
ON public.business_continuity_plans 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create storage bucket for BCP documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('bcp-documents', 'bcp-documents', false);

-- Create storage policies for BCP documents
CREATE POLICY "Users can view BCP documents they have access to" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can upload BCP documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can update BCP documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "RMD can delete BCP documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'bcp-documents' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bcp_updated_at
BEFORE UPDATE ON public.business_continuity_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit log table for BCP changes
CREATE TABLE public.bcp_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bcp_id UUID NOT NULL REFERENCES public.business_continuity_plans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.bcp_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RMD can view BCP audit logs" 
ON public.bcp_audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

-- Create audit trigger function for BCP changes
CREATE OR REPLACE FUNCTION public.create_bcp_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (NEW.id, 'updated', jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    ), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.bcp_audit_logs (bcp_id, action, changes, performed_by)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for BCP audit logging
CREATE TRIGGER bcp_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.business_continuity_plans
FOR EACH ROW EXECUTE FUNCTION public.create_bcp_audit_log();