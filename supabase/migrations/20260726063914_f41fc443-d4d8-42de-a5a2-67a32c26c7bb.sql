
-- 1) Auto-generate follow_up_token; backfill any nulls
UPDATE public.whistleblow_cases
   SET follow_up_token = encode(gen_random_bytes(32), 'hex')
 WHERE follow_up_token IS NULL OR follow_up_token = '';

ALTER TABLE public.whistleblow_cases
  ALTER COLUMN follow_up_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- 2) Storage policies for whistleblow-evidence bucket
-- Reads restricted to RMD/CRO/ADMIN via user_has_role.
CREATE POLICY "Investigators can read whistleblow evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whistleblow-evidence' AND (
    public.user_has_role(auth.uid(), 'RMD'::user_role)
    OR public.user_has_role(auth.uid(), 'CRO'::user_role)
    OR public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  )
);

-- Anonymous / client writes are blocked; the whistleblow-submit edge function
-- uses the service role and bypasses these policies.
