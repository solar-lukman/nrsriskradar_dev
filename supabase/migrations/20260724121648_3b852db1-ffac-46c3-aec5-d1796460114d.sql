-- 1) Attempt ledger
CREATE TABLE public.whistleblow_submission_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT,
  fingerprint TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_wb_attempts_ip_time ON public.whistleblow_submission_attempts (ip_address, attempted_at DESC);
CREATE INDEX idx_wb_attempts_fp_time ON public.whistleblow_submission_attempts (fingerprint, attempted_at DESC);

-- Service role only (edge function writes; no client access)
GRANT ALL ON public.whistleblow_submission_attempts TO service_role;

ALTER TABLE public.whistleblow_submission_attempts ENABLE ROW LEVEL SECURITY;

-- Deny all client access explicitly; service role bypasses RLS
CREATE POLICY "wb_attempts_no_client_access"
  ON public.whistleblow_submission_attempts
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2) Rate-limit checker (SECURITY DEFINER, callable only by service role)
CREATE OR REPLACE FUNCTION public.check_whistleblow_rate_limit(
  _ip TEXT,
  _fingerprint TEXT,
  _window_minutes INT DEFAULT 10,
  _max_per_ip INT DEFAULT 3,
  _max_per_fingerprint INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - make_interval(mins => _window_minutes);
  v_ip_count INT := 0;
  v_fp_count INT := 0;
BEGIN
  IF _ip IS NOT NULL AND length(trim(_ip)) > 0 THEN
    SELECT count(*) INTO v_ip_count
    FROM public.whistleblow_submission_attempts
    WHERE ip_address = _ip AND attempted_at >= v_window_start;
  END IF;

  IF _fingerprint IS NOT NULL AND length(trim(_fingerprint)) > 0 THEN
    SELECT count(*) INTO v_fp_count
    FROM public.whistleblow_submission_attempts
    WHERE fingerprint = _fingerprint AND attempted_at >= v_window_start;
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_ip_count < _max_per_ip AND v_fp_count < _max_per_fingerprint),
    'ip_count', v_ip_count,
    'fp_count', v_fp_count,
    'max_per_ip', _max_per_ip,
    'max_per_fingerprint', _max_per_fingerprint,
    'window_minutes', _window_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_whistleblow_rate_limit(TEXT, TEXT, INT, INT, INT) TO service_role;