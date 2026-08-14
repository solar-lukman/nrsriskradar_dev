ALTER TABLE public.business_continuity_plans
  ADD COLUMN IF NOT EXISTS bia_criticality_rating TEXT,
  ADD COLUMN IF NOT EXISTS bia_financial_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS bia_operational_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_reputational_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_regulatory_impact TEXT,
  ADD COLUMN IF NOT EXISTS bia_max_tolerable_downtime INTEGER,
  ADD COLUMN IF NOT EXISTS bia_assessment_date DATE,
  ADD COLUMN IF NOT EXISTS test_type TEXT,
  ADD COLUMN IF NOT EXISTS test_scope TEXT,
  ADD COLUMN IF NOT EXISTS test_results TEXT,
  ADD COLUMN IF NOT EXISTS test_findings JSONB DEFAULT '[]'::jsonb;