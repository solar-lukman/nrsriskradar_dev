-- Create enum for document types
CREATE TYPE public.document_type AS ENUM ('Policy', 'SOP', 'Risk Framework', 'Procedure', 'Guideline', 'Standard');

-- Create enum for document status
CREATE TYPE public.document_status AS ENUM ('Draft', 'Under Review', 'Approved', 'Archived', 'Superseded');

-- Create control documents table
CREATE TABLE public.control_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mfiles_id TEXT UNIQUE, -- M-Files object ID
  title TEXT NOT NULL,
  description TEXT,
  document_type document_type NOT NULL,
  document_number TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  status document_status NOT NULL DEFAULT 'Draft',
  owner_id UUID REFERENCES auth.users(id),
  department TEXT,
  effective_date DATE,
  review_date DATE,
  next_review_date DATE,
  file_url TEXT, -- M-Files download URL or local storage
  file_size INTEGER,
  file_extension TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create document acknowledgments table
CREATE TABLE public.document_acknowledgments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.control_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  version_acknowledged TEXT NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id, version_acknowledged)
);

-- Enable RLS
ALTER TABLE public.control_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Create policies for control documents
CREATE POLICY "All authenticated users can view documents" 
ON public.control_documents 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "RMD and document owners can create documents" 
ON public.control_documents 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    ) 
    OR auth.uid() = owner_id
  )
);

CREATE POLICY "RMD and document owners can update documents" 
ON public.control_documents 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  ) 
  OR owner_id = auth.uid() 
  OR created_by = auth.uid()
);

CREATE POLICY "RMD can delete documents" 
ON public.control_documents 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'ADMIN')
  )
);

-- Create policies for acknowledgments
CREATE POLICY "Users can view their own acknowledgments" 
ON public.document_acknowledgments 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "RMD can view all acknowledgments" 
ON public.document_acknowledgments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
  )
);

CREATE POLICY "Users can create their own acknowledgments" 
ON public.document_acknowledgments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_control_documents_updated_at
BEFORE UPDATE ON public.control_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_control_documents_type ON public.control_documents(document_type);
CREATE INDEX idx_control_documents_status ON public.control_documents(status);
CREATE INDEX idx_control_documents_owner ON public.control_documents(owner_id);
CREATE INDEX idx_control_documents_department ON public.control_documents(department);
CREATE INDEX idx_document_acknowledgments_document ON public.document_acknowledgments(document_id);
CREATE INDEX idx_document_acknowledgments_user ON public.document_acknowledgments(user_id);