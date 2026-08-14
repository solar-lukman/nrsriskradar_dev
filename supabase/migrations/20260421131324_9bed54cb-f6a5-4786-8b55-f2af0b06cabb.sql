-- ============================================================================
-- STEP 2: Columns, tables, RLS, indexes (depends on Step 1's enum values)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RISKS TABLE — add Phase 2 + previously expected columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS risk_type public.risk_type NOT NULL DEFAULT 'institutional',
  ADD COLUMN IF NOT EXISTS risk_reference TEXT,
  ADD COLUMN IF NOT EXISTS tax_type TEXT,
  ADD COLUMN IF NOT EXISTS estimated_tax_at_risk NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_sector TEXT,
  ADD COLUMN IF NOT EXISTS tax_sub_sector TEXT,
  ADD COLUMN IF NOT EXISTS compliance_description TEXT,
  ADD COLUMN IF NOT EXISTS information_sources TEXT,
  ADD COLUMN IF NOT EXISTS treatment_owner_id UUID,
  ADD COLUMN IF NOT EXISTS monitoring_officer_id UUID,
  ADD COLUMN IF NOT EXISTS treatment_timeline TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS mitigation_budget_spent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_score_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_predicted_score NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_score_explanation TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS control_effectiveness_score INTEGER,
  ADD COLUMN IF NOT EXISTS target_control_score INTEGER,
  ADD COLUMN IF NOT EXISTS treatment_strategy TEXT,
  ADD COLUMN IF NOT EXISTS strategic_objective TEXT,
  ADD COLUMN IF NOT EXISTS review_frequency TEXT,
  ADD COLUMN IF NOT EXISTS flagged_for_audit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS crystallized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crystallization_status TEXT,
  ADD COLUMN IF NOT EXISTS actual_impact_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID;

-- ----------------------------------------------------------------------------
-- 2. AUTO-NUMBERING: IR<YY><MM><SEQ> / CR<YY><MM><SEQ>
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.risk_reference_seq;

CREATE OR REPLACE FUNCTION public.generate_risk_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  yy TEXT;
  mm TEXT;
  seq INTEGER;
BEGIN
  IF NEW.risk_reference IS NOT NULL AND NEW.risk_reference <> '' THEN
    RETURN NEW;
  END IF;
  prefix := CASE WHEN NEW.risk_type = 'compliance' THEN 'CR' ELSE 'IR' END;
  yy := to_char(now(), 'YY');
  mm := to_char(now(), 'MM');
  seq := nextval('public.risk_reference_seq');
  NEW.risk_reference := prefix || yy || mm || lpad(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_risk_reference ON public.risks;
CREATE TRIGGER trg_generate_risk_reference
  BEFORE INSERT ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.generate_risk_reference();

-- ----------------------------------------------------------------------------
-- 3. LOOKUP TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view departments" ON public.departments;
CREATE POLICY "All authenticated can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'ADMIN'));

CREATE TABLE IF NOT EXISTS public.strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategic_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated can view objectives" ON public.strategic_objectives;
CREATE POLICY "All authenticated can view objectives" ON public.strategic_objectives FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage objectives" ON public.strategic_objectives;
CREATE POLICY "Admins manage objectives" ON public.strategic_objectives FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'ADMIN'));

-- ----------------------------------------------------------------------------
-- 4. RISK ASSESSMENTS / CONTROLS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assessment_type TEXT NOT NULL DEFAULT 'periodic',
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  control_score INTEGER,
  notes TEXT,
  assessed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view assessments" ON public.risk_assessments;
CREATE POLICY "Authorized view assessments" ON public.risk_assessments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage assessments" ON public.risk_assessments;
CREATE POLICY "Authorized manage assessments" ON public.risk_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

CREATE TABLE IF NOT EXISTS public.risk_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  control_name TEXT NOT NULL,
  control_type TEXT NOT NULL DEFAULT 'preventive',
  description TEXT,
  effectiveness_rating TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  test_frequency TEXT NOT NULL DEFAULT 'quarterly',
  last_tested_date DATE,
  next_test_date DATE,
  owner_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view controls" ON public.risk_controls;
CREATE POLICY "Authorized view controls" ON public.risk_controls FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage controls" ON public.risk_controls;
CREATE POLICY "Authorized manage controls" ON public.risk_controls FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 5. RISK EVENTS / CRYSTALLIZED INCIDENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID REFERENCES public.risks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'crystallized',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  impact_amount NUMERIC,
  impact_description TEXT,
  reported_by UUID,
  status TEXT NOT NULL DEFAULT 'reported',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view risk events" ON public.risk_events;
CREATE POLICY "Authorized view risk events" ON public.risk_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','EC','ERMSC','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "Authorized manage risk events" ON public.risk_events;
CREATE POLICY "Authorized manage risk events" ON public.risk_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RO','RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 6. RISK HISTORY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  changed_by UUID,
  change_type TEXT NOT NULL DEFAULT 'update',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view risk history" ON public.risk_history;
CREATE POLICY "Authorized view risk history" ON public.risk_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "System insert risk history" ON public.risk_history;
CREATE POLICY "System insert risk history" ON public.risk_history FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. AI PREDICTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID REFERENCES public.risks(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL,
  predicted_value JSONB NOT NULL,
  confidence_score NUMERIC,
  model_version TEXT,
  explanation TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authorized view AI predictions" ON public.ai_predictions;
CREATE POLICY "Authorized view AI predictions" ON public.ai_predictions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RC','RR','RO','RMD','CRO','EC','ERMSC','ADMIN','SUPERVISOR')));
DROP POLICY IF EXISTS "System insert AI predictions" ON public.ai_predictions;
CREATE POLICY "System insert AI predictions" ON public.ai_predictions FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 8. BOARD REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_report_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID,
  period_start DATE,
  period_end DATE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.board_report_archives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Executives view board reports" ON public.board_report_archives;
CREATE POLICY "Executives view board reports" ON public.board_report_archives FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','EC','ERMSC','RCB','ADMIN')));
DROP POLICY IF EXISTS "RMD manage board reports" ON public.board_report_archives;
CREATE POLICY "RMD manage board reports" ON public.board_report_archives FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','ADMIN')));

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  recipients JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RMD view schedules" ON public.report_schedules;
CREATE POLICY "RMD view schedules" ON public.report_schedules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "RMD manage schedules" ON public.report_schedules;
CREATE POLICY "RMD manage schedules" ON public.report_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','ADMIN')));

-- ----------------------------------------------------------------------------
-- 9. WHISTLEBLOWING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whistleblow_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,
  follow_up_token TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT true,
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_phone TEXT,
  incident_date DATE,
  incident_location TEXT,
  involved_parties TEXT,
  evidence_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  flagged_unassigned BOOLEAN DEFAULT false,
  flagged_stagnant BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view cases" ON public.whistleblow_cases;
CREATE POLICY "Investigators view cases" ON public.whistleblow_cases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "Investigators manage cases" ON public.whistleblow_cases;
CREATE POLICY "Investigators manage cases" ON public.whistleblow_cases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));

CREATE TABLE IF NOT EXISTS public.whistleblow_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_id UUID,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view messages" ON public.whistleblow_messages;
CREATE POLICY "Investigators view messages" ON public.whistleblow_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "Investigators send messages" ON public.whistleblow_messages;
CREATE POLICY "Investigators send messages" ON public.whistleblow_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                      AND role IN ('RMD','CRO','ADMIN')));

CREATE TABLE IF NOT EXISTS public.whistleblow_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.whistleblow_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID,
  details JSONB DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whistleblow_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Investigators view whistleblow audit" ON public.whistleblow_audit_log;
CREATE POLICY "Investigators view whistleblow audit" ON public.whistleblow_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
                 AND role IN ('RMD','CRO','ADMIN')));
DROP POLICY IF EXISTS "System insert whistleblow audit" ON public.whistleblow_audit_log;
CREATE POLICY "System insert whistleblow audit" ON public.whistleblow_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 10. updated_at triggers
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['departments','strategic_objectives','risk_assessments','risk_controls',
                                'risk_events','report_schedules','whistleblow_cases'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_risks_risk_type ON public.risks(risk_type);
CREATE INDEX IF NOT EXISTS idx_risks_risk_reference ON public.risks(risk_reference);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk_id ON public.risk_assessments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_risk_id ON public.risk_controls(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_risk_id ON public.risk_events(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_history_risk_id ON public.risk_history(risk_id);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_risk_id ON public.ai_predictions(risk_id);
CREATE INDEX IF NOT EXISTS idx_whistleblow_cases_status ON public.whistleblow_cases(status);
CREATE INDEX IF NOT EXISTS idx_whistleblow_messages_case_id ON public.whistleblow_messages(case_id);