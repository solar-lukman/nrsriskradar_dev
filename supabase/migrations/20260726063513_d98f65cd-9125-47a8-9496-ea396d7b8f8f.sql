
-- 1) Avatars: restrict write policies to authenticated role
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2) Control documents: ensure department comparison excludes NULLs
DROP POLICY IF EXISTS "Read control documents by role/owner/department" ON storage.objects;

CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1
      FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = objects.name
        AND (
          cd.owner_id = auth.uid()
          OR (
            cd.department IS NOT NULL
            AND p.department IS NOT NULL
            AND cd.department = p.department
          )
        )
    )
  )
);

-- 3) user_roles: allow signed-in users to view their own role rows
CREATE POLICY "Users can view their own role assignments"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());
