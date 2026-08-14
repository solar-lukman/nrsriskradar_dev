-- Create private storage bucket for control documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('control-documents', 'control-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read control document files (file metadata + signed URLs gate downloads)
CREATE POLICY "Authenticated can read control documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'control-documents');

-- RMD/CRO/ADMIN can upload/update/delete control document files
CREATE POLICY "Managers can upload control documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
  )
);

CREATE POLICY "Managers can update control documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
  )
);

CREATE POLICY "Managers can delete control documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['RMD'::user_role, 'ADMIN'::user_role])
  )
);