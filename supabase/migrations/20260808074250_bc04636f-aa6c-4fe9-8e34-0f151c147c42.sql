ALTER TABLE public.bcp_tests
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS original_scheduled_date date,
  ADD COLUMN IF NOT EXISTS reschedule_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.track_bcp_test_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.original_scheduled_date IS NULL THEN
      NEW.original_scheduled_date := NEW.scheduled_date;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.original_scheduled_date IS NULL THEN
    NEW.original_scheduled_date := COALESCE(OLD.original_scheduled_date, OLD.scheduled_date, NEW.scheduled_date);
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    NEW.reschedule_history := COALESCE(OLD.reschedule_history, '[]'::jsonb) || jsonb_build_object(
      'from', OLD.scheduled_date,
      'to', NEW.scheduled_date,
      'changed_at', now(),
      'changed_by', auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_bcp_test_reschedule ON public.bcp_tests;
CREATE TRIGGER trg_track_bcp_test_reschedule
BEFORE INSERT OR UPDATE ON public.bcp_tests
FOR EACH ROW EXECUTE FUNCTION public.track_bcp_test_reschedule();