
-- ================================================
-- Feature 2: Treatment Task Management Table
-- ================================================
CREATE TABLE public.risk_mitigation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  evidence_notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_mitigation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view mitigation tasks"
  ON public.risk_mitigation_tasks FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "Risk editors can manage mitigation tasks"
  ON public.risk_mitigation_tasks FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

CREATE TRIGGER update_mitigation_tasks_updated_at
  BEFORE UPDATE ON public.risk_mitigation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- Feature 3: Document Vault - Storage Bucket & Table
-- ================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('risk-attachments', 'risk-attachments', false);

CREATE POLICY "Authenticated users can view risk attachment files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload risk attachment files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete risk attachment files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'risk-attachments' AND auth.role() = 'authenticated');

CREATE TABLE public.risk_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  file_type text,
  attachment_type text NOT NULL DEFAULT 'evidence',
  description text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view risk attachments"
  ON public.risk_attachments FOR SELECT
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

CREATE POLICY "Risk editors can manage attachments"
  ON public.risk_attachments FOR ALL
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

-- ================================================
-- Feature 1: Workflow Engine - Deadline Check Function
-- ================================================
CREATE OR REPLACE FUNCTION public.check_risk_deadlines()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  -- Upcoming reviews (7 days out)
  FOR r IN
    SELECT id, title, review_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date = CURRENT_DATE + INTERVAL '7 days'
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id, 'Risk Review Due in 7 Days',
        'Risk "' || r.title || '" is due for review on ' || r.review_date,
        'warning', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Overdue reviews
  FOR r IN
    SELECT id, title, review_date, owner_id
    FROM public.risks
    WHERE review_date IS NOT NULL
      AND review_date < CURRENT_DATE
      AND status NOT IN ('Mitigated')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Risk Review Overdue',
        'Risk "' || r.title || '" review was due on ' || r.review_date || '. Please review immediately.',
        'error', 'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation target dates approaching (7 days) and overdue (1 day past)
  FOR r IN
    SELECT id, title, target_date, owner_id, assigned_to_id
    FROM public.risks
    WHERE target_date IS NOT NULL
      AND status = 'In Treatment'
      AND (target_date = CURRENT_DATE + INTERVAL '7 days'
           OR target_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
    IF r.assigned_to_id IS NOT NULL AND r.assigned_to_id IS DISTINCT FROM r.owner_id THEN
      PERFORM public.send_notification(
        r.assigned_to_id,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'Mitigation Target Overdue' ELSE 'Mitigation Target Due in 7 Days' END,
        'Risk "' || r.title || '" mitigation target date is ' || r.target_date,
        CASE WHEN r.target_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.id
      );
    END IF;
  END LOOP;

  -- Mitigation task deadlines (3 days out and 1 day overdue)
  FOR r IN
    SELECT t.id, t.title AS task_title, t.due_date, t.assigned_to,
           ri.title AS risk_title, ri.id AS risk_id
    FROM public.risk_mitigation_tasks t
    JOIN public.risks ri ON ri.id = t.risk_id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.due_date IS NOT NULL
      AND (t.due_date = CURRENT_DATE + INTERVAL '3 days'
           OR t.due_date = CURRENT_DATE - INTERVAL '1 day')
  LOOP
    IF r.assigned_to IS NOT NULL THEN
      PERFORM public.send_notification(
        r.assigned_to,
        CASE WHEN r.due_date < CURRENT_DATE THEN 'Mitigation Task Overdue' ELSE 'Mitigation Task Due Soon' END,
        'Task "' || r.task_title || '" for risk "' || r.risk_title || '"',
        CASE WHEN r.due_date < CURRENT_DATE THEN 'error' ELSE 'warning' END,
        'risk_update', 'risk', r.risk_id
      );
    END IF;
  END LOOP;
END;
$$;
