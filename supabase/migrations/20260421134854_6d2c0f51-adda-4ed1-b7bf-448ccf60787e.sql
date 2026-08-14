-- 1. Add compliance category enum values
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Registration';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Filing';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Disclosure/Reporting';
ALTER TYPE public.risk_category ADD VALUE IF NOT EXISTS 'Payment';

-- 2. Add taxpayer_segment column
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS taxpayer_segment TEXT;

-- 3. Compliance Risk Register view (security_invoker so RLS on risks applies)
CREATE OR REPLACE VIEW public.compliance_risk_register_view
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.risk_reference,
  r.title,
  r.description,
  r.category,
  r.department,
  r.status,
  r.tax_type,
  r.estimated_tax_at_risk,
  r.tax_sector,
  r.tax_sub_sector,
  r.taxpayer_segment,
  r.compliance_description,
  r.information_sources,
  r.treatment_owner_id,
  r.monitoring_officer_id,
  r.treatment_timeline,
  r.treatment_strategy,
  r.inherent_likelihood,
  r.inherent_impact,
  r.residual_likelihood,
  r.residual_impact,
  r.review_date,
  r.target_date,
  r.created_at,
  r.updated_at,
  r.created_by,
  r.owner_id
FROM public.risks r
WHERE r.risk_type = 'compliance';

GRANT SELECT ON public.compliance_risk_register_view TO authenticated;