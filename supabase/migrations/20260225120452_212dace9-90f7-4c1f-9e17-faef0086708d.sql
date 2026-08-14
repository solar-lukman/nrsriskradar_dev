
SELECT cron.schedule(
  'check-risk-deadlines-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://niquvgluxlnifkquwlrn.supabase.co/functions/v1/check-deadlines',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pcXV2Z2x1eGxuaWZrcXV3bHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5ODQwNDcsImV4cCI6MjA2NzU2MDA0N30.dfccUfnoZ-irNq584TRNQV2cc6Tsz2wvg0sjdB22fQU"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
