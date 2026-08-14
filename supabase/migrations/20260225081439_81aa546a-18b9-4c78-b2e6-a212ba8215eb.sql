
-- Report archives table
CREATE TABLE public.board_report_archives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  report_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Report schedules table
CREATE TABLE public.report_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for board_report_archives
ALTER TABLE public.board_report_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board members and admins can view archives"
  ON public.board_report_archives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'ADMIN')
    )
  );

CREATE POLICY "Authorized users can create archives"
  ON public.board_report_archives FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    )
  );

CREATE POLICY "System can insert archives"
  ON public.board_report_archives FOR INSERT
  WITH CHECK (true);

-- RLS for report_schedules
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage schedules"
  ON public.report_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('RMD', 'CRO', 'ADMIN')
    )
  );
