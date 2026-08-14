-- Replace permissive WITH CHECK (true) insert policies with WITH CHECK (false).
-- Rows are written by SECURITY DEFINER triggers/functions (owner bypasses RLS)
-- and by edge functions using the service_role key (bypasses RLS).
-- No legitimate direct client insert path exists for these tables.

DROP POLICY IF EXISTS "System insert task history" ON public.risk_mitigation_task_history;
CREATE POLICY "Block direct task history inserts"
  ON public.risk_mitigation_task_history
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System inserts risk category audit logs" ON public.risk_category_audit_logs;
CREATE POLICY "Block direct risk category audit inserts"
  ON public.risk_category_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "System insert AI predictions" ON public.ai_predictions;
CREATE POLICY "Block direct AI prediction inserts"
  ON public.ai_predictions
  FOR INSERT TO authenticated
  WITH CHECK (false);