-- Update default currency from USD to NGN (Nigerian Naira)
ALTER TABLE public.risks 
ALTER COLUMN mitigation_budget_currency SET DEFAULT 'NGN';