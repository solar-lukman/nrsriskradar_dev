-- Add granular AI scoring columns expected by the UI
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS ai_recommended_likelihood INTEGER CHECK (ai_recommended_likelihood IS NULL OR (ai_recommended_likelihood BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS ai_recommended_impact INTEGER CHECK (ai_recommended_impact IS NULL OR (ai_recommended_impact BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS ai_confidence INTEGER CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS ai_score_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS ai_score_generated_at TIMESTAMP WITH TIME ZONE;

-- Trigger to log status transitions for the workflow lifecycle
CREATE OR REPLACE FUNCTION public.log_risk_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.risk_audit_logs (risk_id, action, changes, performed_by)
    VALUES (
      NEW.id,
      'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      COALESCE(auth.uid(), NEW.created_by)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_risk_status_change ON public.risks;
CREATE TRIGGER trg_log_risk_status_change
AFTER UPDATE ON public.risks
FOR EACH ROW
EXECUTE FUNCTION public.log_risk_status_change();