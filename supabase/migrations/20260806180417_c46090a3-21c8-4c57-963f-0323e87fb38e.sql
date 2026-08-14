
CREATE TABLE IF NOT EXISTS public.bcp_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bcp_id uuid NOT NULL REFERENCES public.business_continuity_plans(id) ON DELETE CASCADE,
  test_type text NOT NULL,
  test_scope text,
  test_results text,
  test_status text NOT NULL DEFAULT 'Scheduled',
  scheduled_date date,
  performed_date date,
  participants text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  reminder_sent_at timestamptz,
  performed_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bcp_tests_status_chk CHECK (test_status IN ('Scheduled','Passed','Failed','Cancelled','Not Tested')),
  CONSTRAINT bcp_tests_dates_chk CHECK (scheduled_date IS NOT NULL OR performed_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bcp_tests_bcp_id_idx ON public.bcp_tests(bcp_id);
CREATE INDEX IF NOT EXISTS bcp_tests_scheduled_idx ON public.bcp_tests(scheduled_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bcp_tests TO authenticated;
GRANT ALL ON public.bcp_tests TO service_role;

ALTER TABLE public.bcp_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View bcp tests with plan access" ON public.bcp_tests
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.business_continuity_plans b
  WHERE b.id = bcp_tests.bcp_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
              AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role,'ERMSC'::user_role,'EC'::user_role,'RCB'::user_role]))
      OR b.department = (SELECT p2.department FROM public.profiles p2 WHERE p2.user_id = auth.uid())
    )
));

CREATE POLICY "Manage bcp tests with plan edit rights" ON public.bcp_tests
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.business_continuity_plans b
  WHERE b.id = bcp_tests.bcp_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
              AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role]))
      OR b.owner_id = auth.uid() OR b.created_by = auth.uid()
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.business_continuity_plans b
  WHERE b.id = bcp_tests.bcp_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
              AND p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role]))
      OR b.owner_id = auth.uid() OR b.created_by = auth.uid()
    )
));

CREATE OR REPLACE FUNCTION public.touch_bcp_tests_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bcp_tests_updated_at ON public.bcp_tests;
CREATE TRIGGER trg_bcp_tests_updated_at BEFORE UPDATE ON public.bcp_tests
FOR EACH ROW EXECUTE FUNCTION public.touch_bcp_tests_updated_at();

-- Keep the parent plan's summary test fields in sync with its test history
CREATE OR REPLACE FUNCTION public.sync_bcp_plan_from_tests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bcp uuid := COALESCE(NEW.bcp_id, OLD.bcp_id);
  v_last record;
  v_next date;
BEGIN
  SELECT * INTO v_last FROM public.bcp_tests
   WHERE bcp_id = v_bcp AND performed_date IS NOT NULL AND test_status IN ('Passed','Failed')
   ORDER BY performed_date DESC, created_at DESC LIMIT 1;

  SELECT MIN(scheduled_date) INTO v_next FROM public.bcp_tests
   WHERE bcp_id = v_bcp AND test_status = 'Scheduled' AND scheduled_date >= CURRENT_DATE;

  UPDATE public.business_continuity_plans b
     SET last_tested_date = COALESCE(v_last.performed_date, b.last_tested_date),
         next_test_date   = COALESCE(v_next, b.next_test_date),
         test_type        = COALESCE(v_last.test_type, b.test_type),
         test_scope       = COALESCE(v_last.test_scope, b.test_scope),
         test_results     = COALESCE(v_last.test_results, b.test_results),
         test_status      = CASE
                              WHEN v_last.test_status IN ('Passed','Failed') THEN v_last.test_status::test_status
                              ELSE b.test_status
                            END
   WHERE b.id = v_bcp;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bcp_plan_from_tests ON public.bcp_tests;
CREATE TRIGGER trg_sync_bcp_plan_from_tests
AFTER INSERT OR UPDATE OR DELETE ON public.bcp_tests
FOR EACH ROW EXECUTE FUNCTION public.sync_bcp_plan_from_tests();

-- Reminder generator: in-app notifications for upcoming / overdue scheduled tests
CREATE OR REPLACE FUNCTION public.check_bcp_test_reminders()
RETURNS TABLE(notification_id uuid, user_id uuid, title text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  r record;
  v_days int;
  v_title text;
  v_msg text;
BEGIN
  FOR t IN
    SELECT bt.*, b.title AS plan_title, b.department, b.owner_id, b.created_by AS plan_creator
      FROM public.bcp_tests bt
      JOIN public.business_continuity_plans b ON b.id = bt.bcp_id
     WHERE bt.test_status = 'Scheduled'
       AND bt.scheduled_date IS NOT NULL
       AND bt.scheduled_date <= CURRENT_DATE + 14
  LOOP
    v_days := t.scheduled_date - CURRENT_DATE;
    IF v_days NOT IN (14, 7, 1, 0) AND v_days >= 0 THEN
      CONTINUE;
    END IF;
    IF t.reminder_sent_at IS NOT NULL AND t.reminder_sent_at > now() - interval '20 hours' THEN
      CONTINUE;
    END IF;

    IF v_days < 0 THEN
      v_title := 'Overdue BCP test';
      v_msg := format('The %s test for "%s" was scheduled for %s and is %s day(s) overdue.',
                      t.test_type, t.plan_title, to_char(t.scheduled_date, 'DD Mon YYYY'), abs(v_days));
    ELSIF v_days = 0 THEN
      v_title := 'BCP test due today';
      v_msg := format('The %s test for "%s" is scheduled for today.', t.test_type, t.plan_title);
    ELSE
      v_title := format('BCP test due in %s day(s)', v_days);
      v_msg := format('The %s test for "%s" is scheduled for %s.',
                      t.test_type, t.plan_title, to_char(t.scheduled_date, 'DD Mon YYYY'));
    END IF;

    FOR r IN
      SELECT DISTINCT p.user_id FROM public.profiles p
       WHERE p.user_id IN (t.owner_id, t.plan_creator, t.created_by)
          OR p.role = ANY (ARRAY['RMD'::user_role,'CRO'::user_role,'ADMIN'::user_role])
    LOOP
      RETURN QUERY
      INSERT INTO public.notifications (user_id, title, message, category, type, resource_id, resource_type, metadata)
      VALUES (r.user_id, v_title, v_msg, 'bcp_change',
              CASE WHEN v_days < 0 THEN 'warning' ELSE 'info' END,
              t.bcp_id, 'business_continuity_plan',
              jsonb_build_object('bcp_test_id', t.id, 'scheduled_date', t.scheduled_date, 'days_until', v_days))
      RETURNING notifications.id, notifications.user_id, notifications.title, notifications.message;
    END LOOP;

    UPDATE public.bcp_tests SET reminder_sent_at = now() WHERE id = t.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.check_bcp_test_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_bcp_test_reminders() TO service_role;
