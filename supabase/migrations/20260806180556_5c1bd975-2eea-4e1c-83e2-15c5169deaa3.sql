
DO $$
BEGIN
  PERFORM cron.unschedule('bcp-test-reminders-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'bcp-test-reminders-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qpymmsgvrcrqothvmjjr.supabase.co/functions/v1/bcp-test-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
