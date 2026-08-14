-- Create backup configurations table
CREATE TABLE public.backup_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  backup_type TEXT CHECK (backup_type IN ('incremental', 'full', 'differential')) NOT NULL,
  schedule_cron TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30,
  storage_location TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  enterprise_endpoint TEXT,
  authentication_method TEXT CHECK (authentication_method IN ('api_key', 'oauth', 'certificate')) DEFAULT 'api_key',
  encryption_enabled BOOLEAN DEFAULT true,
  compression_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup logs table
CREATE TABLE public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  configuration_id UUID NOT NULL,
  backup_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  file_size_bytes BIGINT,
  backup_location TEXT,
  checksum TEXT,
  error_message TEXT,
  duration_seconds INTEGER,
  records_backed_up INTEGER,
  metadata JSONB DEFAULT '{}',
  created_by UUID
);

-- Create recovery checklists table
CREATE TABLE public.recovery_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('system_failure', 'data_corruption', 'security_breach', 'disaster_recovery')) NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',
  estimated_time_minutes INTEGER,
  steps JSONB NOT NULL DEFAULT '[]',
  prerequisites JSONB DEFAULT '[]',
  validation_steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup restore operations table
CREATE TABLE public.backup_restore_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_log_id UUID NOT NULL,
  restore_type TEXT CHECK (restore_type IN ('full_system', 'partial_data', 'specific_tables', 'point_in_time')) NOT NULL,
  target_timestamp TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  restored_records INTEGER,
  error_message TEXT,
  validation_results JSONB DEFAULT '{}',
  checklist_id UUID,
  performed_by UUID NOT NULL,
  approved_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.backup_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_operations ENABLE ROW LEVEL SECURITY;

-- RLS policies for backup_configurations
CREATE POLICY "Admins can manage backup configurations" 
ON public.backup_configurations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_logs
CREATE POLICY "Admins can view backup logs" 
ON public.backup_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "System can insert backup logs" 
ON public.backup_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "System can update backup logs" 
ON public.backup_logs 
FOR UPDATE 
TO authenticated 
USING (true);

-- RLS policies for recovery_checklists
CREATE POLICY "Admins can manage recovery checklists" 
ON public.recovery_checklists 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for backup_restore_operations
CREATE POLICY "Admins can manage restore operations" 
ON public.backup_restore_operations 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create indexes for performance
CREATE INDEX idx_backup_configurations_active ON public.backup_configurations(is_active);
CREATE INDEX idx_backup_configurations_schedule ON public.backup_configurations(schedule_cron) WHERE is_active = true;
CREATE INDEX idx_backup_logs_config_id ON public.backup_logs(configuration_id);
CREATE INDEX idx_backup_logs_status ON public.backup_logs(status);
CREATE INDEX idx_backup_logs_started_at ON public.backup_logs(started_at DESC);
CREATE INDEX idx_recovery_checklists_category ON public.recovery_checklists(category);
CREATE INDEX idx_recovery_checklists_priority ON public.recovery_checklists(priority);
CREATE INDEX idx_backup_restore_operations_status ON public.backup_restore_operations(status);

-- Add foreign key constraints
ALTER TABLE public.backup_logs 
ADD CONSTRAINT fk_backup_logs_configuration 
FOREIGN KEY (configuration_id) REFERENCES public.backup_configurations(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_backup_log 
FOREIGN KEY (backup_log_id) REFERENCES public.backup_logs(id) ON DELETE CASCADE;

ALTER TABLE public.backup_restore_operations 
ADD CONSTRAINT fk_restore_checklist 
FOREIGN KEY (checklist_id) REFERENCES public.recovery_checklists(id) ON DELETE SET NULL;

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_backup_configurations_updated_at
BEFORE UPDATE ON public.backup_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recovery_checklists_updated_at
BEFORE UPDATE ON public.recovery_checklists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get backup status summary
CREATE OR REPLACE FUNCTION public.get_backup_status_summary()
RETURNS TABLE(
  total_configurations INTEGER,
  active_configurations INTEGER,
  recent_backups_24h INTEGER,
  successful_backups_24h INTEGER,
  failed_backups_24h INTEGER,
  last_full_backup TIMESTAMP WITH TIME ZONE,
  next_scheduled_backup TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations) as total_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_configurations WHERE is_active = true) as active_configurations,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours') as recent_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'completed') as successful_backups_24h,
    (SELECT COUNT(*)::INTEGER FROM public.backup_logs WHERE started_at >= now() - interval '24 hours' AND status = 'failed') as failed_backups_24h,
    (SELECT MAX(completed_at) FROM public.backup_logs WHERE backup_type = 'full' AND status = 'completed') as last_full_backup,
    (SELECT MIN(started_at) FROM public.backup_logs WHERE status = 'pending') as next_scheduled_backup;
$$;

-- Insert default backup configurations
INSERT INTO public.backup_configurations (name, backup_type, schedule_cron, retention_days, storage_location, created_by) VALUES
('Daily Incremental Backup', 'incremental', '0 2 * * *', 7, '/enterprise/backups/incremental/', (
  SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1
)),
('Weekly Full Backup', 'full', '0 1 * * 0', 30, '/enterprise/backups/full/', (
  SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1
));

-- Insert default recovery checklists
INSERT INTO public.recovery_checklists (title, description, category, priority, estimated_time_minutes, steps, prerequisites, validation_steps, created_by) VALUES
(
  'System Failure Recovery',
  'Complete system failure recovery procedure',
  'system_failure',
  'critical',
  120,
  '[
    {"step": 1, "action": "Assess system status and identify failure scope", "estimated_minutes": 15},
    {"step": 2, "action": "Notify stakeholders and activate incident response team", "estimated_minutes": 10},
    {"step": 3, "action": "Identify most recent successful backup", "estimated_minutes": 5},
    {"step": 4, "action": "Prepare recovery environment", "estimated_minutes": 30},
    {"step": 5, "action": "Restore from backup", "estimated_minutes": 45},
    {"step": 6, "action": "Validate data integrity", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Access to backup storage location"},
    {"item": "Recovery environment prepared"},
    {"item": "Incident response team activated"},
    {"item": "Stakeholder notification completed"}
  ]'::jsonb,
  '[
    {"check": "All critical systems operational"},
    {"check": "Data integrity verified"},
    {"check": "User access restored"},
    {"check": "Backup schedule resumed"}
  ]'::jsonb,
  (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)
),
(
  'Data Corruption Recovery',
  'Recovery procedure for data corruption incidents',
  'data_corruption',
  'high',
  90,
  '[
    {"step": 1, "action": "Isolate corrupted data to prevent spread", "estimated_minutes": 10},
    {"step": 2, "action": "Identify corruption scope and affected tables", "estimated_minutes": 20},
    {"step": 3, "action": "Locate clean backup point before corruption", "estimated_minutes": 15},
    {"step": 4, "action": "Perform selective data restoration", "estimated_minutes": 30},
    {"step": 5, "action": "Verify data integrity and consistency", "estimated_minutes": 15}
  ]'::jsonb,
  '[
    {"item": "Database access credentials"},
    {"item": "Backup verification tools"},
    {"item": "Data integrity checking tools"}
  ]'::jsonb,
  '[
    {"check": "No data corruption detected"},
    {"check": "All relationships intact"},
    {"check": "Application functionality restored"},
    {"check": "Monitoring alerts cleared"}
  ]'::jsonb,
  (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)
);

-- Create function to schedule backup operation
CREATE OR REPLACE FUNCTION public.schedule_backup_operation(
  p_configuration_id UUID,
  p_backup_type TEXT,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  backup_log_id UUID;
BEGIN
  INSERT INTO public.backup_logs (
    configuration_id, backup_type, status, created_by
  ) VALUES (
    p_configuration_id, p_backup_type, 'pending', p_created_by
  ) RETURNING id INTO backup_log_id;
  
  RETURN backup_log_id;
END;
$$;