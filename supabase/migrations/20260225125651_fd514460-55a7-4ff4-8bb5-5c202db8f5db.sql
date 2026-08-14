
-- Phase 1a: Add 'Crystallized' to risk_status enum
ALTER TYPE public.risk_status ADD VALUE IF NOT EXISTS 'Crystallized';

-- Phase 1b: Create risk_events table
CREATE TABLE public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  discovered_date date NOT NULL DEFAULT CURRENT_DATE,
  reported_by uuid NOT NULL,
  root_cause text NOT NULL,
  event_description text NOT NULL,
  immediate_response text NOT NULL,
  corrective_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  financial_impact numeric DEFAULT NULL,
  financial_impact_currency text DEFAULT 'NGN',
  operational_impact text DEFAULT NULL,
  reputational_impact text DEFAULT NULL,
  risk_posture text NOT NULL DEFAULT 'Under Review',
  lessons_learned text DEFAULT NULL,
  status text NOT NULL DEFAULT 'Open',
  resolution_date date DEFAULT NULL,
  resolved_by uuid DEFAULT NULL,
  severity text NOT NULL DEFAULT 'Medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_risk_events_risk_id ON public.risk_events(risk_id);
CREATE INDEX idx_risk_events_status ON public.risk_events(status);

-- Updated_at trigger
CREATE TRIGGER update_risk_events_updated_at
  BEFORE UPDATE ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- RLS: View policy
CREATE POLICY "Authorized users can view risk events"
  ON public.risk_events FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RR','RO','RMD','CRO','ADMIN']::user_role[]));

-- RLS: Manage policy
CREATE POLICY "Risk editors can manage risk events"
  ON public.risk_events FOR ALL TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RC','RO','RMD','ADMIN']::user_role[]));

-- Update check_risk_deadlines to handle open risk events > 30 days
CREATE OR REPLACE FUNCTION public.check_risk_deadlines()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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

  -- Open risk events older than 30 days without resolution
  FOR r IN
    SELECT re.id, re.event_description, re.created_at, ri.title AS risk_title,
           ri.id AS risk_id, ri.owner_id
    FROM public.risk_events re
    JOIN public.risks ri ON ri.id = re.risk_id
    WHERE re.status IN ('Open', 'Under Investigation')
      AND re.created_at < now() - INTERVAL '30 days'
      AND re.resolution_date IS NULL
  LOOP
    IF r.owner_id IS NOT NULL THEN
      PERFORM public.send_notification(
        r.owner_id, 'Unresolved Risk Event (30+ days)',
        'Risk event for "' || r.risk_title || '" has been open for over 30 days. Please resolve or update.',
        'error', 'risk_update', 'risk', r.risk_id
      );
    END IF;
  END LOOP;
END;
$function$;
