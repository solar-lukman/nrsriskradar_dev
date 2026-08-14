-- Create risk-attachments storage bucket (private; signed URLs for access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('risk-attachments', 'risk-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read risk attachments
CREATE POLICY "Authenticated can read risk attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'risk-attachments');

-- Authenticated users can upload risk attachments
CREATE POLICY "Authenticated can upload risk attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'risk-attachments' AND auth.uid() IS NOT NULL);

-- Owners (uploader) can update their files
CREATE POLICY "Owners can update their risk attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'risk-attachments' AND owner = auth.uid());

-- Owners can delete their files; admins/RMD/CRO can delete any
CREATE POLICY "Owners and risk leaders can delete risk attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN','RMD','CRO')
    )
  )
);