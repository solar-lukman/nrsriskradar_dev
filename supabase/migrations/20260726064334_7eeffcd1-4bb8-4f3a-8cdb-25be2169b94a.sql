
-- 1) user_roles: add explicit WITH CHECK on admin ALL policy for clarity
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'ADMIN'::user_role
  )
);

-- 2) whistleblow_attachments: allow ADMIN/CRO/RMD to update and delete attachments
CREATE POLICY "Admins can update attachments"
ON public.whistleblow_attachments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);

CREATE POLICY "Admins can delete attachments"
ON public.whistleblow_attachments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ADMIN'::user_role, 'CRO'::user_role, 'RMD'::user_role)
  )
);
