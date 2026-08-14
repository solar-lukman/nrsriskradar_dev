-- Add unique constraint on setting_key (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_setting_key_unique'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_setting_key_unique UNIQUE (setting_key);
  END IF;
END $$;

-- Phase 5: control effectiveness + post-control reassessment
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS control_effectiveness_rating text
    CHECK (control_effectiveness_rating IN ('High', 'Medium', 'Low'));

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS post_control_likelihood integer CHECK (post_control_likelihood BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS post_control_impact integer CHECK (post_control_impact BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS post_control_assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_control_assessed_by uuid,
  ADD COLUMN IF NOT EXISTS post_control_notes text;

-- Phase 5: Matrix dimensions setting
INSERT INTO public.system_settings (setting_key, setting_value, category, description)
VALUES (
  'matrix_dimensions',
  jsonb_build_object('institutional', 5, 'compliance', 5),
  'risk_matrix',
  'Configurable matrix size per register type (4 or 5)'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Phase 6: Integration placeholders
INSERT INTO public.system_settings (setting_key, setting_value, category, description) VALUES
  ('integration_mfiles', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'vault_id', '', 'status', 'coming_soon'), 'integrations', 'M-Files EDRMS document repository'),
  ('integration_active_directory', jsonb_build_object('enabled', false, 'domain', '', 'ldap_url', '', 'bind_dn', '', 'bind_password', '', 'status', 'coming_soon'), 'integrations', 'Active Directory authentication & user provisioning'),
  ('integration_cac', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'environment', 'sandbox', 'status', 'coming_soon'), 'integrations', 'Corporate Affairs Commission registry verification'),
  ('integration_nimc', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'merchant_id', '', 'status', 'coming_soon'), 'integrations', 'NIMC National Identity verification'),
  ('integration_nitda', jsonb_build_object('enabled', false, 'endpoint', '', 'api_key', '', 'organisation_code', '', 'status', 'coming_soon'), 'integrations', 'NITDA data protection compliance reporting')
ON CONFLICT (setting_key) DO NOTHING;