-- Add risk_type to risk_categories so it can drive both institutional & compliance dropdowns
ALTER TABLE public.risk_categories
  ADD COLUMN IF NOT EXISTS risk_type public.risk_type NOT NULL DEFAULT 'institutional';

-- Backfill existing rows (Strategic, Operational, etc. are institutional — already default)
-- Seed the four compliance categories if they don't already exist
INSERT INTO public.risk_categories (name, description, color, display_order, is_active, risk_type)
SELECT v.name, v.description, v.color, v.display_order, true, 'compliance'::public.risk_type
FROM (VALUES
  ('Registration',         'Taxpayer registration compliance risk',  '#0EA5E9', 101),
  ('Filing',               'Tax return filing compliance risk',      '#6366F1', 102),
  ('Disclosure/Reporting', 'Disclosure and reporting compliance risk','#8B5CF6', 103),
  ('Payment',              'Tax payment compliance risk',            '#10B981', 104)
) AS v(name, description, color, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.risk_categories rc WHERE rc.name = v.name
);

-- For any pre-existing row whose name matches a compliance value, fix its type
UPDATE public.risk_categories
SET risk_type = 'compliance'
WHERE name IN ('Registration', 'Filing', 'Disclosure/Reporting', 'Payment')
  AND risk_type <> 'compliance';