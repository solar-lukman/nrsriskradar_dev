
-- Sequence for case reference numbers
CREATE SEQUENCE IF NOT EXISTS whistleblow_case_seq START 1;

-- Core cases table
CREATE TABLE public.whistleblow_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference text UNIQUE NOT NULL,
  reporter_passphrase_hash text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  date_of_incident date,
  location text,
  individuals_involved text,
  evidence_description text,
  priority text,
  status text NOT NULL DEFAULT 'Submitted',
  assigned_to uuid,
  escalated_to uuid,
  escalation_reason text,
  resolution_summary text,
  resolution_date date,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.whistleblow_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'reporter',
  sender_id uuid,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attachments table
CREATE TABLE public.whistleblow_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  uploaded_by_type text NOT NULL DEFAULT 'reporter',
  uploaded_by uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log table
CREATE TABLE public.whistleblow_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid,
  old_value text,
  new_value text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for cases
CREATE TRIGGER update_whistleblow_cases_updated_at
  BEFORE UPDATE ON public.whistleblow_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.whistleblow_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whistleblow_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: whistleblow_cases
CREATE POLICY "Investigators can view cases"
  ON public.whistleblow_cases FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can update cases"
  ON public.whistleblow_cases FOR UPDATE TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- RLS: whistleblow_messages
CREATE POLICY "Investigators can view messages"
  ON public.whistleblow_messages FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can insert messages"
  ON public.whistleblow_messages FOR INSERT TO authenticated
  WITH CHECK (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    AND sender_type = 'investigator' AND sender_id = auth.uid());

-- RLS: whistleblow_attachments
CREATE POLICY "Investigators can view attachments"
  ON public.whistleblow_attachments FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can insert attachments"
  ON public.whistleblow_attachments FOR INSERT TO authenticated
  WITH CHECK (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role])
    AND uploaded_by_type = 'investigator' AND uploaded_by = auth.uid());

-- RLS: whistleblow_audit_log
CREATE POLICY "Investigators can view audit log"
  ON public.whistleblow_audit_log FOR SELECT TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "System can insert audit log"
  ON public.whistleblow_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('whistleblow-attachments', 'whistleblow-attachments', false);

-- Storage RLS
CREATE POLICY "Investigators can view whistleblow files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whistleblow-attachments' AND user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

CREATE POLICY "Investigators can upload whistleblow files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whistleblow-attachments' AND user_has_any_role(auth.uid(), ARRAY['RMD'::user_role, 'CRO'::user_role, 'ADMIN'::user_role]));

-- Deadline monitoring function
CREATE OR REPLACE FUNCTION public.check_whistleblow_deadlines()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Cases unassigned for > 14 days
  FOR r IN
    SELECT id, case_reference, subject
    FROM public.whistleblow_cases
    WHERE assigned_to IS NULL
      AND status = 'Submitted'
      AND created_at < now() - INTERVAL '14 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Unassigned Whistleblow Case (14+ days)',
      'Case ' || r.case_reference || ' "' || r.subject || '" has been unassigned for over 14 days.',
      'error', 'whistleblow', 'whistleblow_case', r.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('RMD', 'ADMIN');
  END LOOP;

  -- Cases under investigation > 60 days
  FOR r IN
    SELECT id, case_reference, subject
    FROM public.whistleblow_cases
    WHERE status = 'Investigation'
      AND updated_at < now() - INTERVAL '60 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, category, resource_type, resource_id)
    SELECT p.user_id,
      'Long-running Investigation (60+ days)',
      'Case ' || r.case_reference || ' "' || r.subject || '" has been under investigation for over 60 days.',
      'warning', 'whistleblow', 'whistleblow_case', r.id
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role IN ('CRO', 'ADMIN');
  END LOOP;
END;
$$;
