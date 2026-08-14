-- Create system settings table
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, setting_key)
);

-- Create risk categories table
CREATE TABLE public.risk_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risk scoring matrix table
CREATE TABLE public.risk_scoring_matrix (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  impact_level INTEGER NOT NULL CHECK (impact_level BETWEEN 1 AND 5),
  likelihood_level INTEGER NOT NULL CHECK (likelihood_level BETWEEN 1 AND 5),
  risk_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('Very Low', 'Low', 'Medium', 'High', 'Very High')),
  color TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(impact_level, likelihood_level)
);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_scoring_matrix ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_settings - only admins can manage
CREATE POLICY "Admins can manage system settings" 
ON public.system_settings 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- RLS policies for risk_categories - admins can manage, others can view
CREATE POLICY "Admins can manage risk categories" 
ON public.risk_categories 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "All users can view risk categories" 
ON public.risk_categories 
FOR SELECT 
TO authenticated 
USING (is_active = true);

-- RLS policies for risk_scoring_matrix - admins can manage, others can view
CREATE POLICY "Admins can manage risk scoring matrix" 
ON public.risk_scoring_matrix 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "All users can view risk scoring matrix" 
ON public.risk_scoring_matrix 
FOR SELECT 
TO authenticated 
USING (true);

-- Create indexes
CREATE INDEX idx_system_settings_category ON public.system_settings(category);
CREATE INDEX idx_system_settings_key ON public.system_settings(setting_key);
CREATE INDEX idx_risk_categories_active ON public.risk_categories(is_active);
CREATE INDEX idx_risk_categories_order ON public.risk_categories(display_order);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_categories_updated_at
BEFORE UPDATE ON public.risk_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_scoring_matrix_updated_at
BEFORE UPDATE ON public.risk_scoring_matrix
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default system settings
INSERT INTO public.system_settings (category, setting_key, setting_value, description, updated_by) VALUES
('security', 'password_policy', '{"min_length": 8, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_symbols": false, "max_age_days": 90}', 'Password policy configuration', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('security', 'session_timeout', '{"inactivity_minutes": 5, "absolute_timeout_hours": 8}', 'Session timeout configuration', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('integrations', 'mfiles_config', '{"server_url": "", "username": "", "password": "", "vault_guid": "", "enabled": false}', 'M-Files integration settings', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1)),
('integrations', 'csdd_config', '{"portal_url": "", "api_key": "", "enabled": false}', 'CSDD portal integration settings', (SELECT user_id FROM public.profiles WHERE role = 'ADMIN' LIMIT 1));

-- Insert default risk categories
INSERT INTO public.risk_categories (name, description, color, display_order) VALUES
('Strategic', 'Risks related to strategic planning and business direction', '#EF4444', 1),
('Operational', 'Risks from day-to-day business operations', '#F97316', 2),
('Financial', 'Risks affecting financial performance and resources', '#10B981', 3),
('Compliance', 'Regulatory and legal compliance risks', '#3B82F6', 4),
('Technology', 'IT and technology-related risks', '#8B5CF6', 5),
('Reputational', 'Risks affecting company reputation and brand', '#EC4899', 6),
('Environmental', 'Environmental and sustainability risks', '#06B6D4', 7),
('Human Resources', 'People and workforce-related risks', '#84CC16', 8);

-- Insert default risk scoring matrix (5x5 matrix)
INSERT INTO public.risk_scoring_matrix (impact_level, likelihood_level, risk_score, risk_level, color) VALUES
-- Very Low Risk (1-4)
(1, 1, 1, 'Very Low', '#10B981'),
(1, 2, 2, 'Very Low', '#10B981'),
(2, 1, 2, 'Very Low', '#10B981'),
(1, 3, 3, 'Very Low', '#10B981'),
-- Low Risk (5-8)
(2, 2, 4, 'Low', '#84CC16'),
(1, 4, 4, 'Low', '#84CC16'),
(3, 1, 3, 'Low', '#84CC16'),
(1, 5, 5, 'Low', '#84CC16'),
(2, 3, 6, 'Low', '#84CC16'),
-- Medium Risk (9-15)
(3, 2, 6, 'Medium', '#F59E0B'),
(2, 4, 8, 'Medium', '#F59E0B'),
(4, 1, 4, 'Medium', '#F59E0B'),
(3, 3, 9, 'Medium', '#F59E0B'),
(2, 5, 10, 'Medium', '#F59E0B'),
(4, 2, 8, 'Medium', '#F59E0B'),
(3, 4, 12, 'Medium', '#F59E0B'),
(5, 1, 5, 'Medium', '#F59E0B'),
(4, 3, 12, 'Medium', '#F59E0B'),
(3, 5, 15, 'Medium', '#F59E0B'),
-- High Risk (16-20)
(5, 2, 10, 'High', '#F97316'),
(4, 4, 16, 'High', '#F97316'),
(5, 3, 15, 'High', '#F97316'),
(4, 5, 20, 'High', '#F97316'),
-- Very High Risk (21-25)
(5, 4, 20, 'Very High', '#EF4444'),
(5, 5, 25, 'Very High', '#EF4444');