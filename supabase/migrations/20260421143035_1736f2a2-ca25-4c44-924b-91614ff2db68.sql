-- Add missing incident columns expected by the dashboard and crystallization dialog
ALTER TABLE public.risk_events
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS discovered_date date,
  ADD COLUMN IF NOT EXISTS resolution_date date,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS risk_posture text,
  ADD COLUMN IF NOT EXISTS financial_impact numeric,
  ADD COLUMN IF NOT EXISTS financial_impact_currency text DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS event_description text,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS immediate_response text,
  ADD COLUMN IF NOT EXISTS corrective_actions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operational_impact text,
  ADD COLUMN IF NOT EXISTS reputational_impact text,
  ADD COLUMN IF NOT EXISTS lessons_learned text,
  ADD COLUMN IF NOT EXISTS title text;

-- Backfill event_date from occurred_at where missing so existing rows render
UPDATE public.risk_events
SET event_date = occurred_at::date
WHERE event_date IS NULL AND occurred_at IS NOT NULL;

-- Backfill severity for legacy rows
UPDATE public.risk_events
SET severity = 'Medium'
WHERE severity IS NULL;

UPDATE public.risk_events
SET risk_posture = 'Under Review'
WHERE risk_posture IS NULL;

CREATE INDEX IF NOT EXISTS idx_risk_events_event_date ON public.risk_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON public.risk_events(severity);