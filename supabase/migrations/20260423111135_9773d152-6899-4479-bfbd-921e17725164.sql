-- Enable RLS and add policies for treatment_strategy_status_map
ALTER TABLE public.treatment_strategy_status_map ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read mappings (needed by risk wizard for all submitters)
CREATE POLICY "Authenticated users can view strategy mappings"
ON public.treatment_strategy_status_map
FOR SELECT
TO authenticated
USING (true);

-- Only ADMIN, RMD, CRO can manage mappings
CREATE POLICY "Admins can insert strategy mappings"
ON public.treatment_strategy_status_map
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);

CREATE POLICY "Admins can update strategy mappings"
ON public.treatment_strategy_status_map
FOR UPDATE
TO authenticated
USING (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
)
WITH CHECK (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);

CREATE POLICY "Admins can delete strategy mappings"
ON public.treatment_strategy_status_map
FOR DELETE
TO authenticated
USING (
  public.user_has_role(auth.uid(), 'ADMIN'::user_role)
  OR public.user_has_role(auth.uid(), 'RMD'::user_role)
  OR public.user_has_role(auth.uid(), 'CRO'::user_role)
);