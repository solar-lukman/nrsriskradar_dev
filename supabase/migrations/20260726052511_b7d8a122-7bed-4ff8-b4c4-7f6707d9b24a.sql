GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_events TO authenticated;
GRANT ALL ON public.risk_events TO service_role;

ALTER TABLE public.whistleblow_cases ALTER COLUMN case_number DROP NOT NULL;
UPDATE public.whistleblow_cases SET case_number = case_reference WHERE case_number IS NULL AND case_reference IS NOT NULL;