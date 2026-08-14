
-- Create strategic_objectives table
CREATE TABLE public.strategic_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategic_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active objectives"
  ON public.strategic_objectives FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage objectives"
  ON public.strategic_objectives FOR ALL
  TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role, 'RMD'::user_role]));

-- Create departments table
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (user_has_any_role(auth.uid(), ARRAY['ADMIN'::user_role, 'RMD'::user_role]));

-- Seed departments from existing data
INSERT INTO public.departments (name)
SELECT DISTINCT department FROM public.profiles WHERE department IS NOT NULL AND department != ''
UNION
SELECT DISTINCT department FROM public.risks WHERE department IS NOT NULL AND department != ''
ON CONFLICT (name) DO NOTHING;
