-- 1) History (audit trail) table
CREATE TABLE IF NOT EXISTS public.risk_mitigation_task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.risk_mitigation_tasks(id) ON DELETE CASCADE,
  risk_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_rmth_task ON public.risk_mitigation_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_rmth_risk ON public.risk_mitigation_task_history(risk_id);

ALTER TABLE public.risk_mitigation_task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized view task history" ON public.risk_mitigation_task_history;
CREATE POLICY "Authorized view task history"
ON public.risk_mitigation_task_history
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['RC'::user_role,'RR'::user_role,'RO'::user_role,'RMD'::user_role,'CRO'::user_role,'SUPERVISOR'::user_role,'ADMIN'::user_role])
));

DROP POLICY IF EXISTS "System insert task history" ON public.risk_mitigation_task_history;
CREATE POLICY "System insert task history"
ON public.risk_mitigation_task_history
FOR INSERT
TO authenticated
WITH CHECK (true);

GRANT SELECT, INSERT ON public.risk_mitigation_task_history TO authenticated;

-- 2) Transition validation + completion metadata trigger (BEFORE UPDATE)
CREATE OR REPLACE FUNCTION public.validate_mitigation_task_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed TEXT[];
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'pending'     THEN ARRAY['pending','in_progress','cancelled']
      WHEN 'in_progress' THEN ARRAY['in_progress','pending','completed','cancelled']
      WHEN 'completed'   THEN ARRAY['completed','in_progress']
      WHEN 'cancelled'   THEN ARRAY['cancelled','pending']
      ELSE ARRAY['pending','in_progress','completed','cancelled']
    END;

    IF NOT (NEW.status = ANY(allowed)) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
      NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
    ELSIF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
      NEW.completed_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_mitigation_task_transition ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_validate_mitigation_task_transition
BEFORE UPDATE ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_mitigation_task_transition();

-- 3) History + notification trigger (AFTER UPDATE)
CREATE OR REPLACE FUNCTION public.log_mitigation_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notify_user UUID;
  risk_title TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- log history
    INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NEW.risk_id, OLD.status, NEW.status, auth.uid());

    -- look up risk title for nicer messages (best effort)
    BEGIN
      SELECT title INTO risk_title FROM public.risks WHERE id = NEW.risk_id;
    EXCEPTION WHEN OTHERS THEN
      risk_title := NULL;
    END;

    -- notify assignee
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        NEW.assigned_to,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id)
      );
    END IF;

    -- notify risk leadership (RMD/CRO/ADMIN), excluding the actor
    FOR notify_user IN
      SELECT user_id FROM public.profiles
      WHERE role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
        AND user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
        AND user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        notify_user,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mitigation_task_status_change ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_log_mitigation_task_status_change
AFTER UPDATE ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_mitigation_task_status_change();

-- 4) Log initial status on insert too
CREATE OR REPLACE FUNCTION public.log_mitigation_task_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by, note)
  VALUES (NEW.id, NEW.risk_id, NULL, NEW.status, COALESCE(auth.uid(), NEW.created_by), 'Task created');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mitigation_task_insert ON public.risk_mitigation_tasks;
CREATE TRIGGER trg_log_mitigation_task_insert
AFTER INSERT ON public.risk_mitigation_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_mitigation_task_insert();