
-- 1. Storage: control-documents ownership/department check
DROP POLICY IF EXISTS "Authenticated can read control documents" ON storage.objects;

CREATE POLICY "Read control documents by role/owner/department"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'control-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.control_documents cd
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE cd.file_url = storage.objects.name
        AND (cd.owner_id = auth.uid() OR cd.department = p.department)
    )
  )
);

-- 2. notification_preferences: replace ALL policy with per-command policies that enforce ownership on writes
DROP POLICY IF EXISTS "Users can manage their own preferences" ON public.notification_preferences;

CREATE POLICY "np_select_own" ON public.notification_preferences
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "np_insert_own" ON public.notification_preferences
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_update_own" ON public.notification_preferences
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "np_delete_own" ON public.notification_preferences
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. profiles UPDATE: add WITH CHECK (role change still blocked by prevent_profile_role_self_escalation_trg)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. forum_votes: replace ALL policy with per-command ownership-enforced policies
DROP POLICY IF EXISTS "Users can manage their own votes" ON public.forum_votes;

CREATE POLICY "fv_select_own" ON public.forum_votes
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "fv_insert_own" ON public.forum_votes
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_update_own" ON public.forum_votes
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fv_delete_own" ON public.forum_votes
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. recovery_checklists: admin ALL policy needs matching WITH CHECK
DROP POLICY IF EXISTS "Admins can manage recovery checklists" ON public.recovery_checklists;

CREATE POLICY "Admins can manage recovery checklists"
ON public.recovery_checklists FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'::user_role
  )
);
