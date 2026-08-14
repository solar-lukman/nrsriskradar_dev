
-- Only ADMINs can read from the onprem-exports bucket
CREATE POLICY "onprem_exports_admin_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);

-- Only ADMINs can delete (post-import cleanup)
CREATE POLICY "onprem_exports_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'onprem-exports'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'ADMIN'::public.user_role
  )
);
