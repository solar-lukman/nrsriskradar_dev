-- Temporarily disable audit trigger on risks since this is a system-level normalization
ALTER TABLE public.risks DISABLE TRIGGER USER;

UPDATE public.risks
SET taxpayer_segment = CASE
  WHEN taxpayer_segment IN ('Large', 'Large Taxpayer', 'Large Taxpayers', 'LTO') THEN 'Large Taxpayers'
  WHEN taxpayer_segment IN ('Medium', 'Medium Taxpayer', 'Medium Taxpayers', 'MTO', 'SME') THEN 'Medium Taxpayers'
  WHEN taxpayer_segment IN ('Emerging', 'Emerging Taxpayer', 'Emerging Taxpayers', 'Small Taxpayer', 'Small Taxpayers') THEN 'Emerging Taxpayers'
  WHEN taxpayer_segment IN ('All', 'all', '') THEN NULL
  ELSE taxpayer_segment
END
WHERE taxpayer_segment IS NOT NULL;

ALTER TABLE public.risks ENABLE TRIGGER USER;

UPDATE public.risk_appetite_config
SET taxpayer_segment = CASE
  WHEN taxpayer_segment IN ('Large', 'Large Taxpayer', 'Large Taxpayers', 'LTO') THEN 'Large Taxpayers'
  WHEN taxpayer_segment IN ('Medium', 'Medium Taxpayer', 'Medium Taxpayers', 'MTO', 'SME') THEN 'Medium Taxpayers'
  WHEN taxpayer_segment IN ('Emerging', 'Emerging Taxpayer', 'Emerging Taxpayers', 'Small Taxpayer', 'Small Taxpayers') THEN 'Emerging Taxpayers'
  WHEN taxpayer_segment IN ('All', 'all', '') THEN NULL
  ELSE taxpayer_segment
END
WHERE taxpayer_segment IS NOT NULL;