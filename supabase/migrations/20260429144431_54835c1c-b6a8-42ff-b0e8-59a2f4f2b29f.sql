-- 1. Templates
CREATE TABLE public.assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  risk_type risk_type NOT NULL DEFAULT 'institutional',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default per risk_type
CREATE UNIQUE INDEX assessment_templates_one_default_per_type
  ON public.assessment_templates (risk_type)
  WHERE is_default = true AND is_active = true;

-- 2. Sections
CREATE TABLE public.template_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX template_sections_template_idx ON public.template_sections(template_id, sort_order);

-- 3. Questions
CREATE TABLE public.template_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.template_sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  help_text TEXT,
  question_type TEXT NOT NULL DEFAULT 'text'
    CHECK (question_type IN ('text','number','single_choice','multi_choice','rating','yes_no')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX template_questions_section_idx ON public.template_questions(section_id, sort_order);

-- 4. Category mapping
CREATE TABLE public.template_category_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  category risk_category NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, category)
);
CREATE INDEX template_category_links_category_idx ON public.template_category_links(category);

-- 5. Extend risk_assessments
ALTER TABLE public.risk_assessments
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.assessment_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 6. Triggers for updated_at
CREATE TRIGGER update_assessment_templates_updated_at
  BEFORE UPDATE ON public.assessment_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_sections_updated_at
  BEFORE UPDATE ON public.template_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_questions_updated_at
  BEFORE UPDATE ON public.template_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. RLS
ALTER TABLE public.assessment_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_category_links ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a template manager?
CREATE OR REPLACE FUNCTION public.is_template_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = ANY (ARRAY['ADMIN','RMD','CRO']::user_role[])
  );
$$;

-- Read access: any authenticated user can view active templates and their parts
CREATE POLICY "Authenticated view templates"
  ON public.assessment_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template sections"
  ON public.template_sections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template questions"
  ON public.template_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated view template category links"
  ON public.template_category_links FOR SELECT TO authenticated USING (true);

-- Manage access: only ADMIN/RMD/CRO
CREATE POLICY "Managers manage templates"
  ON public.assessment_templates FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage sections"
  ON public.template_sections FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage questions"
  ON public.template_questions FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());

CREATE POLICY "Managers manage category links"
  ON public.template_category_links FOR ALL TO authenticated
  USING (public.is_template_manager())
  WITH CHECK (public.is_template_manager());