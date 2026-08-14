-- Create risk_attachments table for documents & evidence
CREATE TABLE IF NOT EXISTS public.risk_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  attachment_type TEXT NOT NULL DEFAULT 'evidence',
  description TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_attachments_risk_id ON public.risk_attachments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_attachments_uploaded_by ON public.risk_attachments(uploaded_by);

ALTER TABLE public.risk_attachments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view attachments
CREATE POLICY "Authenticated can view risk attachments"
ON public.risk_attachments FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert; uploader must be themselves
CREATE POLICY "Authenticated can upload risk attachments"
ON public.risk_attachments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- Uploader can update their own attachment metadata
CREATE POLICY "Uploader can update own attachment"
ON public.risk_attachments FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

-- Uploader OR ADMIN/RMD/CRO can delete
CREATE POLICY "Uploader or risk leaders can delete attachments"
ON public.risk_attachments FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
  )
);

-- Updated-at trigger
CREATE TRIGGER trg_risk_attachments_updated_at
BEFORE UPDATE ON public.risk_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();