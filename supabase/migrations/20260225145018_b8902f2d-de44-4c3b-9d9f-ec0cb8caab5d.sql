
CREATE OR REPLACE FUNCTION public.nextval_whistleblow_seq()
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT nextval('whistleblow_case_seq');
$$;
