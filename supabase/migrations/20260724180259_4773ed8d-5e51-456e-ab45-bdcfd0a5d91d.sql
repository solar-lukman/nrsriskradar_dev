-- 1) Re-grant table access on core tables (grants got wiped, causing "permission denied")
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT ALL ON public.risks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_continuity_plans TO authenticated;
GRANT ALL ON public.business_continuity_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_report_archives TO authenticated;
GRANT ALL ON public.board_report_archives TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

-- 2) ai_predictions: add columns the app uses
ALTER TABLE public.ai_predictions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_predictions_status ON public.ai_predictions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_predictions TO authenticated;
GRANT ALL ON public.ai_predictions TO service_role;

-- 3) whistleblow_cases: add columns expected by app and edge functions
ALTER TABLE public.whistleblow_cases
  ADD COLUMN IF NOT EXISTS case_reference text,
  ADD COLUMN IF NOT EXISTS reporter_passphrase_hash text,
  ADD COLUMN IF NOT EXISTS date_of_incident date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS individuals_involved text,
  ADD COLUMN IF NOT EXISTS evidence_description text;

-- Backfill case_reference from existing case_number where possible
UPDATE public.whistleblow_cases
  SET case_reference = case_number
  WHERE case_reference IS NULL AND case_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whistleblow_cases_case_reference_key
  ON public.whistleblow_cases(case_reference)
  WHERE case_reference IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whistleblow_cases TO authenticated;
GRANT ALL ON public.whistleblow_cases TO service_role;

-- 4) whistleblow_attachments: create if missing
CREATE TABLE IF NOT EXISTS public.whistleblow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  uploaded_by_type text NOT NULL DEFAULT 'reporter',
  uploaded_by uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.whistleblow_attachments TO authenticated;
GRANT ALL ON public.whistleblow_attachments TO service_role;

ALTER TABLE public.whistleblow_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can view attachments'
  ) THEN
    CREATE POLICY "Investigators can view attachments"
      ON public.whistleblow_attachments FOR SELECT TO authenticated
      USING (public.user_has_role(auth.uid(), 'RMD'::user_role)
          OR public.user_has_role(auth.uid(), 'CRO'::user_role)
          OR public.user_has_role(auth.uid(), 'ADMIN'::user_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='whistleblow_attachments'
      AND policyname='Investigators can insert attachments'
  ) THEN
    CREATE POLICY "Investigators can insert attachments"
      ON public.whistleblow_attachments FOR INSERT TO authenticated
      WITH CHECK ((public.user_has_role(auth.uid(), 'RMD'::user_role)
                OR public.user_has_role(auth.uid(), 'CRO'::user_role)
                OR public.user_has_role(auth.uid(), 'ADMIN'::user_role))
               AND uploaded_by_type = 'investigator'
               AND uploaded_by = auth.uid());
  END IF;
END$$;