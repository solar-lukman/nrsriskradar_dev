GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_mitigation_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_appetite_config TO authenticated;
GRANT SELECT ON public.risk_mitigation_tasks TO anon;
GRANT SELECT ON public.risk_assessments TO anon;
GRANT SELECT ON public.risk_controls TO anon;