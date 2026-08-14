-- 1. Security-definer helper: can the current user access this risk?
CREATE OR REPLACE FUNCTION public.can_access_risk(_risk_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.risks r
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE r.id = _risk_id
      AND p.role = ANY (ARRAY[
        'RC'::user_role,'RR'::user_role,'RO'::user_role,
        'RMD'::user_role,'CRO'::user_role,'EC'::user_role,
        'ERMSC'::user_role,'RCB'::user_role,
        'SUPERVISOR'::user_role,'ADMIN'::user_role
      ])
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_risk(uuid) TO authenticated, anon;

-- 2. Replace risk_attachments policies with access-aware ones
DROP POLICY IF EXISTS "Authenticated can view risk attachments" ON public.risk_attachments;
DROP POLICY IF EXISTS "Authenticated can upload risk attachments" ON public.risk_attachments;
DROP POLICY IF EXISTS "Uploader can update own attachment" ON public.risk_attachments;
DROP POLICY IF EXISTS "Uploader or risk leaders can delete attachments" ON public.risk_attachments;

CREATE POLICY "View attachments for accessible risks"
ON public.risk_attachments FOR SELECT
TO authenticated
USING (public.can_access_risk(risk_id));

CREATE POLICY "Upload attachments to accessible risks"
ON public.risk_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.can_access_risk(risk_id)
);

CREATE POLICY "Uploader can update own attachment"
ON public.risk_attachments FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid() AND public.can_access_risk(risk_id))
WITH CHECK (uploaded_by = auth.uid() AND public.can_access_risk(risk_id));

CREATE POLICY "Uploader or risk leaders can delete attachments"
ON public.risk_attachments FOR DELETE
TO authenticated
USING (
  public.can_access_risk(risk_id)
  AND (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
    )
  )
);

-- 3. Tighten storage policies on the risk-attachments bucket.
-- File paths use the convention "<risk_id>/<uuid>.<ext>", so the first
-- folder is the risk_id we can authorize against.
DROP POLICY IF EXISTS "Authenticated can read risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners and risk leaders can delete risk attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update their risk attachments" ON storage.objects;

CREATE POLICY "Read risk attachments for accessible risks"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Upload risk attachments for accessible risks"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'risk-attachments'
  AND auth.uid() IS NOT NULL
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Update own risk attachment files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND owner = auth.uid()
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Delete risk attachment files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'risk-attachments'
  AND public.can_access_risk(((storage.foldername(name))[1])::uuid)
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['ADMIN'::user_role,'RMD'::user_role,'CRO'::user_role])
    )
  )
);