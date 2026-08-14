GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strategic_objectives TO authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS inherent_likelihood_rationale TEXT,
  ADD COLUMN IF NOT EXISTS inherent_impact_rationale TEXT,
  ADD COLUMN IF NOT EXISTS residual_likelihood_rationale TEXT,
  ADD COLUMN IF NOT EXISTS residual_impact_rationale TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_budget_currency TEXT NOT NULL DEFAULT 'NGN';