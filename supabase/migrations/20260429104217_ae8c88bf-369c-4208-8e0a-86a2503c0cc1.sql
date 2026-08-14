-- Tighten RLS on risk_categories: explicit per-command admin-only policies for write ops
DROP POLICY IF EXISTS "Admins can manage risk categories" ON public.risk_categories;

CREATE POLICY "Admins can insert risk categories"
ON public.risk_categories
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "Admins can update risk categories"
ON public.risk_categories
FOR UPDATE
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role))
WITH CHECK (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

CREATE POLICY "Admins can delete risk categories"
ON public.risk_categories
FOR DELETE
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

-- Also let admins view inactive categories (existing SELECT policy only shows active)
CREATE POLICY "Admins can view all risk categories"
ON public.risk_categories
FOR SELECT
TO authenticated
USING (public.user_has_role(auth.uid(), 'ADMIN'::public.user_role));

-- Block deletion of categories referenced by any existing risk.
-- risks.category is an enum stored as text; match by category name.
CREATE OR REPLACE FUNCTION public.prevent_risk_category_delete_if_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.risks r
  WHERE r.category::text = OLD.name
    AND r.risk_type = OLD.risk_type;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete risk category "%" — it is referenced by % existing risk(s). Disable it instead.',
      OLD.name, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_risk_category_delete_if_in_use ON public.risk_categories;
CREATE TRIGGER trg_prevent_risk_category_delete_if_in_use
BEFORE DELETE ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.prevent_risk_category_delete_if_in_use();