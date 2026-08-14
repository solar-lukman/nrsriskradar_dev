-- Add qualitative assessment fields and mitigation budget tracking to risks table
ALTER TABLE public.risks 
ADD COLUMN inherent_likelihood_rationale TEXT,
ADD COLUMN inherent_impact_rationale TEXT,
ADD COLUMN residual_likelihood_rationale TEXT,
ADD COLUMN residual_impact_rationale TEXT,
ADD COLUMN mitigation_budget DECIMAL(15, 2),
ADD COLUMN mitigation_budget_spent DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN mitigation_budget_currency TEXT DEFAULT 'USD';