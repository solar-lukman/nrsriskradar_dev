CREATE OR REPLACE FUNCTION public.notify_approval_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_type TEXT := 'info';
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status = 'Submitted' THEN
    v_title := 'Risk submitted for review';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been submitted and is awaiting review.';
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id, v_title, v_message, 'info', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['RR','RMD','CRO','SUPERVISOR','ADMIN']::user_role[]);

  ELSIF NEW.approval_status = 'Under Review' THEN
    v_title := 'Your risk is under review';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') is being reviewed.';
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'info', 'approval', 'risk', NEW.id);
    END IF;

  ELSIF NEW.approval_status = 'Returned' THEN
    v_title := 'Risk returned for revision';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') was returned.' ||
      CASE WHEN NEW.last_review_comment IS NOT NULL THEN ' Comments: ' || NEW.last_review_comment ELSE '' END;
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'warning', 'approval', 'risk', NEW.id);
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.submitted_by THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.created_by, v_title, v_message, 'warning', 'approval', 'risk', NEW.id);
    END IF;

  ELSIF NEW.approval_status = 'Approved' THEN
    v_title := 'Risk approved';
    v_message := 'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been approved.';
    -- notify submitter / author
    IF NEW.submitted_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.submitted_by, v_title, v_message, 'success', 'approval', 'risk', NEW.id);
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.submitted_by THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
      VALUES (NEW.created_by, v_title, v_message, 'success', 'approval', 'risk', NEW.id);
    END IF;
    -- inform CRO + RMD
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id, v_title, v_message, 'success', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['CRO','RMD']::user_role[]);
  END IF;

  -- Escalation (status flip, regardless of approval_status)
  IF NEW.status = 'Escalated' AND OLD.status IS DISTINCT FROM 'Escalated' THEN
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Risk escalated to executive attention',
      'Risk "' || NEW.title || '" (' || COALESCE(NEW.risk_reference,'-') || ') has been escalated.',
      'warning', 'approval', 'risk', NEW.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = ANY (ARRAY['EC','ERMSC','RCB','CRO']::user_role[]);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval_status_change ON public.risks;
CREATE TRIGGER trg_notify_approval_status_change
  AFTER UPDATE ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_approval_status_change();