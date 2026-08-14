DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'whistleblow_attachments',
    'risk_category_audit_logs',
    'assessment_templates',
    'template_sections',
    'template_questions',
    'template_category_links',
    'bcp_schema_check_logs',
    'bcp_version_history',
    'auth_failed_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;