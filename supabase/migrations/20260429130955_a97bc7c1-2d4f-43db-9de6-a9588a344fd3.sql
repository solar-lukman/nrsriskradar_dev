-- Update the status change logger to capture an optional note from a session setting
CREATE OR REPLACE FUNCTION public.log_mitigation_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notify_user UUID;
  risk_title TEXT;
  change_note TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- read optional note set by the client for this transaction
    BEGIN
      change_note := NULLIF(current_setting('app.status_change_note', true), '');
    EXCEPTION WHEN OTHERS THEN
      change_note := NULL;
    END;

    INSERT INTO public.risk_mitigation_task_history(task_id, risk_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, NEW.risk_id, OLD.status, NEW.status, auth.uid(), change_note);

    BEGIN
      SELECT title INTO risk_title FROM public.risks WHERE id = NEW.risk_id;
    EXCEPTION WHEN OTHERS THEN
      risk_title := NULL;
    END;

    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, title, message, type, category, resource_type, resource_id, metadata)
      VALUES (
        NEW.assigned_to,
        'Mitigation task status changed',
        'Task "' || NEW.title || '" moved from ' || OLD.status || ' to ' || NEW.status ||
          COALESCE(' (risk: ' || risk_title || ')', '') ||
          COALESCE(E'\nNote: ' || change_note, ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id, 'note', change_note)
      );
    END IF;

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
          COALESCE(' (risk: ' || risk_title || ')', '') ||
          COALESCE(E'\nNote: ' || change_note, ''),
        'info',
        'risk_update',
        'risk_mitigation_task',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status, 'risk_id', NEW.risk_id, 'note', change_note)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- RPC to update a mitigation task status with an optional note, captured by the trigger
CREATE OR REPLACE FUNCTION public.update_mitigation_task_status(
  _task_id UUID,
  _new_status TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Set transaction-local note so the AFTER UPDATE trigger can record it
  PERFORM set_config('app.status_change_note', COALESCE(_note, ''), true);

  UPDATE public.risk_mitigation_tasks
  SET status = _new_status
  WHERE id = _task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_mitigation_task_status(UUID, TEXT, TEXT) TO authenticated;